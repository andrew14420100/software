// Catalog queries, favorites, watch history and "up next" logic.
import { db } from "./db.ts";

export type TitleCard = {
  id: number; slug: string; type: "movie" | "series"; name: string; tagline: string; synopsis: string; year: number | null;
  maturity: string; accent: string; poster_media_id: number | null; media_id: number | null; featured: number; genres: string;
  max_height: number | null; has_hdr: number; duration: number | null;
};
export type Episode = { id: number; season_id: number; season: number; number: number; name: string; synopsis: string; media_id: number | null; duration: number | null; status: string | null };

const CARD = `SELECT t.id, t.slug, t.type, t.name, t.tagline, t.synopsis, t.year, t.maturity, t.accent, t.featured, t.published,
  COALESCE(t.poster_media_id, t.media_id, (SELECT e.media_id FROM episodes e JOIN seasons s ON s.id = e.season_id WHERE s.title_id = t.id ORDER BY s.number, e.number LIMIT 1)) AS poster_media_id,
  t.media_id,
  (SELECT group_concat(g.name, ' · ') FROM title_genres tg JOIN genres g ON g.id = tg.genre_id WHERE tg.title_id = t.id) AS genres,
  (SELECT MAX(m.max_height) FROM media m WHERE m.id = t.media_id OR m.id IN (SELECT e.media_id FROM episodes e JOIN seasons s ON s.id = e.season_id WHERE s.title_id = t.id)) AS max_height,
  (SELECT COALESCE(MAX(m.has_hdr),0) FROM media m WHERE m.id = t.media_id OR m.id IN (SELECT e.media_id FROM episodes e JOIN seasons s ON s.id = e.season_id WHERE s.title_id = t.id)) AS has_hdr,
  (SELECT m.duration FROM media m WHERE m.id = t.media_id) AS duration
  FROM titles t`;

export function listTitles(opts: { type?: string; genre?: string; q?: string; sort?: "new" | "popular" | "name"; limit?: number; includeUnpublished?: boolean } = {}): TitleCard[] {
  const where: string[] = []; const args: (string | number)[] = [];
  if (!opts.includeUnpublished) where.push("t.published = 1");
  if (opts.type) { where.push("t.type = ?"); args.push(opts.type); }
  if (opts.genre) { where.push("t.id IN (SELECT tg.title_id FROM title_genres tg JOIN genres g ON g.id = tg.genre_id WHERE g.slug = ?)"); args.push(opts.genre); }
  if (opts.q) {
    where.push("(t.name LIKE ? ESCAPE '\\' OR t.synopsis LIKE ? ESCAPE '\\' OR t.credits LIKE ? ESCAPE '\\' OR t.id IN (SELECT s.title_id FROM seasons s JOIN episodes e ON e.season_id = s.id WHERE e.name LIKE ? ESCAPE '\\'))");
    const like = "%" + opts.q.replace(/[\\%_]/g, (c) => "\\" + c) + "%"; args.push(like, like, like, like);
  }
  const order = opts.sort === "popular"
    ? "(SELECT COUNT(*) FROM play_events pe WHERE pe.media_id = t.media_id OR pe.media_id IN (SELECT e.media_id FROM episodes e JOIN seasons s ON s.id = e.season_id WHERE s.title_id = t.id)) DESC, t.id DESC"
    : opts.sort === "name" ? "t.name COLLATE NOCASE" : "t.created_at DESC, t.id DESC";
  return db().prepare(`${CARD} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${order} LIMIT ${Number(opts.limit || 100)}`).all(...args) as TitleCard[];
}

export const getTitle = (slug: string) => db().prepare(`${CARD} WHERE t.slug = ?`).get(slug) as (TitleCard & { published: number }) | undefined;
export const titleExtra = (id: number) => db().prepare("SELECT credits, license, attribution, published FROM titles WHERE id = ?").get(id) as { credits: string; license: string; attribution: string; published: number };
export const listGenres = () => db().prepare("SELECT g.*, (SELECT COUNT(*) FROM title_genres tg JOIN titles t ON t.id = tg.title_id WHERE tg.genre_id = g.id AND t.published = 1) AS count FROM genres g ORDER BY name").all() as { id: number; slug: string; name: string; count: number }[];
export const titleGenreIds = (titleId: number) => (db().prepare("SELECT genre_id FROM title_genres WHERE title_id = ?").all(titleId) as { genre_id: number }[]).map((r) => r.genre_id);

export function episodesOf(titleId: number): Episode[] {
  return db().prepare(`SELECT e.id, e.season_id, s.number AS season, e.number, e.name, e.synopsis, e.media_id, m.duration, m.status
    FROM episodes e JOIN seasons s ON s.id = e.season_id LEFT JOIN media m ON m.id = e.media_id WHERE s.title_id = ? ORDER BY s.number, e.number`).all(titleId) as Episode[];
}
export const seasonsOf = (titleId: number) => db().prepare("SELECT * FROM seasons WHERE title_id = ? ORDER BY number").all(titleId) as { id: number; title_id: number; number: number; name: string }[];

/** What a media item belongs to (movie or episode) + the next episode for autoplay. */
export function mediaContext(mediaId: number) {
  const t = db().prepare("SELECT id, slug, name, type FROM titles WHERE media_id = ?").get(mediaId) as { id: number; slug: string; name: string; type: string } | undefined;
  if (t) return { title: t, episode: null as Episode | null, next: null as Episode | null };
  const ep = db().prepare(`SELECT e.*, s.number AS season, s.title_id FROM episodes e JOIN seasons s ON s.id = e.season_id WHERE e.media_id = ?`).get(mediaId) as (Episode & { title_id: number }) | undefined;
  if (!ep) return null;
  const title = db().prepare("SELECT id, slug, name, type FROM titles WHERE id = ?").get(ep.title_id) as { id: number; slug: string; name: string; type: string };
  const all = episodesOf(ep.title_id).filter((e) => e.media_id && e.status === "ready");
  const i = all.findIndex((e) => e.id === ep.id);
  return { title, episode: ep as Episode, next: i >= 0 && i + 1 < all.length ? all[i + 1] : null };
}

// ---- favorites ----
export const isFavorite = (userId: number, titleId: number) => !!db().prepare("SELECT 1 FROM favorites WHERE user_id = ? AND title_id = ?").get(userId, titleId);
export function setFavorite(userId: number, titleId: number, on: boolean) {
  if (on) db().prepare("INSERT OR IGNORE INTO favorites (user_id, title_id) VALUES (?,?)").run(userId, titleId);
  else db().prepare("DELETE FROM favorites WHERE user_id = ? AND title_id = ?").run(userId, titleId);
}
export const favorites = (userId: number) => db().prepare(`${CARD} JOIN favorites f ON f.title_id = t.id WHERE f.user_id = ? AND t.published = 1 ORDER BY f.created_at DESC`).all(userId) as TitleCard[];

// ---- watch progress / history ----
export function saveProgress(userId: number, mediaId: number, position: number, duration: number) {
  if (!(duration > 0) || !(position >= 0)) return;
  const completed = position / duration > 0.95 || duration - position < 20 ? 1 : 0;
  db().prepare(`INSERT INTO watch_progress (user_id, media_id, position, duration, completed, updated_at) VALUES (?,?,?,?,?, datetime('now'))
    ON CONFLICT (user_id, media_id) DO UPDATE SET position = excluded.position, duration = excluded.duration, completed = excluded.completed, updated_at = excluded.updated_at`)
    .run(userId, mediaId, Math.min(position, duration), duration, completed);
}
export const progressOf = (userId: number, mediaId: number) => db().prepare("SELECT position, duration, completed FROM watch_progress WHERE user_id = ? AND media_id = ?").get(userId, mediaId) as { position: number; duration: number; completed: number } | undefined;
export function progressMap(userId: number): Map<number, { position: number; duration: number; completed: number }> {
  const rows = db().prepare("SELECT media_id, position, duration, completed FROM watch_progress WHERE user_id = ?").all(userId) as { media_id: number; position: number; duration: number; completed: number }[];
  return new Map(rows.map((r) => [r.media_id, r]));
}

export type HistoryItem = { media_id: number; position: number; duration: number; completed: number; updated_at: string; slug: string; title: string; type: string; episode: string | null; season: number | null; number: number | null; accent: string };
export function history(userId: number, opts: { onlyInProgress?: boolean; limit?: number } = {}): HistoryItem[] {
  return db().prepare(`SELECT w.media_id, w.position, w.duration, w.completed, w.updated_at,
      COALESCE(t1.slug, t2.slug) slug, COALESCE(t1.name, t2.name) title, COALESCE(t1.type, t2.type) type, COALESCE(t1.accent, t2.accent) accent,
      e.name episode, s.number season, e.number number
    FROM watch_progress w
    LEFT JOIN titles t1 ON t1.media_id = w.media_id
    LEFT JOIN episodes e ON e.media_id = w.media_id LEFT JOIN seasons s ON s.id = e.season_id LEFT JOIN titles t2 ON t2.id = s.title_id
    WHERE w.user_id = ? ${opts.onlyInProgress ? "AND w.completed = 0 AND w.position > 5" : ""} AND COALESCE(t1.id, t2.id) IS NOT NULL
    ORDER BY w.updated_at DESC LIMIT ${Number(opts.limit || 200)}`).all(userId) as HistoryItem[];
}
export const removeHistory = (userId: number, mediaId?: number) =>
  mediaId ? db().prepare("DELETE FROM watch_progress WHERE user_id = ? AND media_id = ?").run(userId, mediaId) : db().prepare("DELETE FROM watch_progress WHERE user_id = ?").run(userId);

/** First unfinished episode of a series (for the "Riprendi"/"Guarda" button). */
export function resumeTarget(userId: number | null, titleId: number): { media_id: number; label: string } | null {
  const t = db().prepare("SELECT type, media_id FROM titles WHERE id = ?").get(titleId) as { type: string; media_id: number | null };
  if (t.type === "movie") return t.media_id ? { media_id: t.media_id, label: "" } : null;
  const eps = episodesOf(titleId).filter((e) => e.media_id && e.status === "ready");
  if (!eps.length) return null;
  if (userId) {
    const pm = progressMap(userId);
    const started = eps.filter((e) => pm.has(e.media_id!));
    if (started.length) {
      const last = started.sort((a, b) => (a.season - b.season) || (a.number - b.number)).pop()!;
      const p = pm.get(last.media_id!)!;
      const idx = eps.indexOf(last);
      const target = p.completed && idx + 1 < eps.length ? eps[idx + 1] : last;
      return { media_id: target.media_id!, label: `S${target.season}:E${target.number}` };
    }
  }
  return { media_id: eps[0].media_id!, label: `S${eps[0].season}:E${eps[0].number}` };
}
