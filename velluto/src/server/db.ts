// SQLite database (better-sqlite3): schema, migrations and base data.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.VELLUTO_DATA_DIR || path.join(process.cwd(), "data"));
export const MEDIA_DIR = path.join(DATA_DIR, "media");
/** Where source videos live (uploads, demo downloads). */
export const SOURCES_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.VELLUTO_SOURCES || path.join(process.env.HOME || ".", "velluto-cache"));

const MIGRATIONS: string[] = [
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
     password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
     autoplay_next INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE sessions (
     id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     user_agent TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_seen TEXT NOT NULL DEFAULT (datetime('now')),
     expires_at TEXT NOT NULL);
   CREATE TABLE plans (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, price_cents INTEGER NOT NULL,
     max_height INTEGER NOT NULL, hdr INTEGER NOT NULL DEFAULT 0, screens INTEGER NOT NULL, sort INTEGER NOT NULL DEFAULT 0,
     active INTEGER NOT NULL DEFAULT 1);
   CREATE TABLE subscriptions (
     id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     plan_id TEXT NOT NULL REFERENCES plans(id), status TEXT NOT NULL CHECK (status IN ('active','canceled','expired')),
     started_at TEXT NOT NULL DEFAULT (datetime('now')), current_period_end TEXT NOT NULL, cancel_at_period_end INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE payments (
     id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan_id TEXT NOT NULL,
     amount_cents INTEGER NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL, reference TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE genres (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
   CREATE TABLE media (
     id INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','error')),
     source TEXT NOT NULL, clip_start REAL NOT NULL DEFAULT 0, clip_seconds REAL NOT NULL DEFAULT 0, make_hdr INTEGER NOT NULL DEFAULT 0,
     duration REAL, max_height INTEGER, has_hdr INTEGER NOT NULL DEFAULT 0, intro_start REAL, intro_end REAL, credits_start REAL,
     progress REAL NOT NULL DEFAULT 0, error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE renditions (
     id INTEGER PRIMARY KEY, media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE, name TEXT NOT NULL,
     width INTEGER NOT NULL, height INTEGER NOT NULL, bandwidth INTEGER NOT NULL, codecs TEXT NOT NULL,
     video_range TEXT NOT NULL DEFAULT 'SDR', frame_rate REAL NOT NULL);
   CREATE TABLE subtitles (
     id INTEGER PRIMARY KEY, media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
     lang TEXT NOT NULL, label TEXT NOT NULL, file TEXT NOT NULL);
   CREATE TABLE titles (
     id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, type TEXT NOT NULL CHECK (type IN ('movie','series')),
     name TEXT NOT NULL, tagline TEXT NOT NULL DEFAULT '', synopsis TEXT NOT NULL DEFAULT '', year INTEGER,
     maturity TEXT NOT NULL DEFAULT 'T', credits TEXT NOT NULL DEFAULT '', license TEXT NOT NULL DEFAULT '',
     attribution TEXT NOT NULL DEFAULT '', media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
     poster_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL, accent TEXT NOT NULL DEFAULT '#d8a657',
     featured INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE title_genres (title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
     genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE, PRIMARY KEY (title_id, genre_id));
   CREATE TABLE seasons (id INTEGER PRIMARY KEY, title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
     number INTEGER NOT NULL, name TEXT NOT NULL, UNIQUE (title_id, number));
   CREATE TABLE episodes (id INTEGER PRIMARY KEY, season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
     number INTEGER NOT NULL, name TEXT NOT NULL, synopsis TEXT NOT NULL DEFAULT '',
     media_id INTEGER REFERENCES media(id) ON DELETE SET NULL, UNIQUE (season_id, number));
   CREATE TABLE favorites (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT (datetime('now')),
     PRIMARY KEY (user_id, title_id));
   CREATE TABLE watch_progress (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE, position REAL NOT NULL, duration REAL NOT NULL,
     completed INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, media_id));
   CREATE TABLE playback_sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     media_id INTEGER NOT NULL, device TEXT, started_at TEXT NOT NULL DEFAULT (datetime('now')), last_seen TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE play_events (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, media_id INTEGER NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE jobs (id INTEGER PRIMARY KEY, media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
     status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','error')), step TEXT,
     log TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE INDEX idx_progress_user ON watch_progress(user_id, updated_at DESC);
   CREATE INDEX idx_play_events_media ON play_events(media_id, created_at);
   CREATE INDEX idx_sessions_user ON sessions(user_id);`,
  `INSERT INTO plans (id,name,description,price_cents,max_height,hdr,screens,sort) VALUES
     ('essenziale','Essenziale','HD 720p su 1 schermo',499,720,0,1,1),
     ('plus','Plus','Full HD 1080p su 2 schermi',899,1080,0,2,2),
     ('ultra','Ultra','4K Ultra HD e HDR10 su 4 schermi',1399,2160,1,4,3);
   INSERT INTO genres (slug,name) VALUES ('animazione','Animazione'),('avventura','Avventura'),('fantascienza','Fantascienza'),
     ('fantasy','Fantasy'),('commedia','Commedia'),('surreale','Surreale'),('tecnologia','Tecnologia');`,
];

type DB = Database.Database;
const g = globalThis as unknown as { __vellutoDb?: DB };

function migrate(db: DB) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)");
  const done = new Set((db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((r) => r.version));
  MIGRATIONS.forEach((sql, i) => {
    if (done.has(i + 1)) return;
    db.transaction(() => { db.exec(sql); db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(i + 1); })();
  });
}

export function db(): DB {
  if (!g.__vellutoDb) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    const d = new Database(path.join(DATA_DIR, "velluto.db"));
    d.pragma("journal_mode = WAL");
    d.pragma("foreign_keys = ON");
    d.pragma("busy_timeout = 5000");
    migrate(d);
    g.__vellutoDb = d;
  }
  return g.__vellutoDb;
}

export const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);
export const sqlTime = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);
