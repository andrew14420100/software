// Seed: accounts + demo catalog (Blender Foundation open movies, CC BY), then media ingest.
// Usage: node scripts/seed.ts            (catalog + transcoding)
//        VELLUTO_CLIP_SECONDS=0 ...       full-length transcodes instead of excerpts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, DATA_DIR } from "../src/server/db.ts";
import { createUser } from "../src/server/auth.ts";
import { subscribe } from "../src/server/subscriptions.ts";
import { createMedia, enqueue, drainQueue } from "../src/server/media.ts";
import { CATALOG } from "./catalog-data.ts";

const SRC = path.resolve(process.env.VELLUTO_SOURCES || path.join(process.env.HOME || ".", "velluto-cache"));
const d = db();
const seeded = (d.prepare("SELECT COUNT(*) n FROM titles").get() as { n: number }).n > 0;

if (!seeded) {
  const pw = () => crypto.randomBytes(9).toString("base64url");
  const adminEmail = process.env.VELLUTO_ADMIN_EMAIL || "admin@velluto.local";
  const adminPw = process.env.VELLUTO_ADMIN_PASSWORD || pw();
  const demoPw = process.env.VELLUTO_DEMO_PASSWORD || pw();
  const adminId = createUser(adminEmail, "Amministratore", adminPw, "admin");
  const demoId = createUser("demo@velluto.local", "Utente Demo", demoPw, "user");
  subscribe(adminId, "ultra");
  subscribe(demoId, "plus");
  fs.writeFileSync(path.join(DATA_DIR, "demo-credentials.txt"),
    `admin ${adminEmail} ${adminPw} (Ultra)\ndemo  demo@velluto.local ${demoPw} (Plus)\n`, { mode: 0o600 });

  // sidecar subtitle list for Tears of Steel (official Blender subtitle files)
  fs.writeFileSync(path.join(SRC, "tos_720p.mov.subs.json"), JSON.stringify([
    { file: path.join(SRC, "tos_it.srt"), lang: "ita", label: "Italiano" },
    { file: path.join(SRC, "tos_en.srt"), lang: "eng", label: "English" },
  ]));

  const clipScale = Number(process.env.VELLUTO_CLIP_SECONDS ?? 1) === 0 ? 0 : 1;
  const genreId = (slug: string) => (d.prepare("SELECT id FROM genres WHERE slug = ?").get(slug) as { id: number }).id;
  const media = (m: { file: string; start: number; seconds: number; hdr?: boolean; intro?: [number, number] }) =>
    createMedia({ source: path.join(SRC, m.file), clipStart: clipScale ? m.start : 0, clipSeconds: clipScale ? m.seconds : 0, hdr: m.hdr, intro: m.intro ?? null, credits: clipScale ? m.seconds - 12 : null });

  d.transaction(() => {
    for (const t of CATALOG) {
      const mediaId = t.media ? media(t.media) : null;
      const id = Number(d.prepare(`INSERT INTO titles (slug,type,name,tagline,synopsis,year,maturity,credits,license,attribution,accent,featured,media_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(t.slug, t.type, t.name, t.tagline, t.synopsis, t.year, t.maturity, t.credits, t.license, t.attribution, t.accent, t.featured ? 1 : 0, mediaId).lastInsertRowid);
      for (const g of t.genres) d.prepare("INSERT INTO title_genres VALUES (?,?)").run(id, genreId(g));
      for (const s of t.seasons || []) {
        const sid = Number(d.prepare("INSERT INTO seasons (title_id, number, name) VALUES (?,?,?)").run(id, s.number, s.name).lastInsertRowid);
        s.episodes.forEach((e, i) => d.prepare("INSERT INTO episodes (season_id, number, name, synopsis, media_id) VALUES (?,?,?,?,?)").run(sid, i + 1, e.name, e.synopsis, media(e.media)));
      }
    }
  })();
  for (const { id } of d.prepare("SELECT id FROM media ORDER BY id").all() as { id: number }[]) enqueue(id);
  console.log("catalog seeded; credentials in data/demo-credentials.txt");
}

if (!process.argv.includes("--no-media")) await drainQueue();
