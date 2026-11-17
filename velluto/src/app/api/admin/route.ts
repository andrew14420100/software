// Admin API (role=admin). One endpoint, explicit actions, all inputs validated.
import fs from "node:fs";
import path from "node:path";
import { db, SOURCES_DIR } from "@/server/db.ts";
import { createMedia, enqueue } from "@/server/media.ts";
import { subscribe } from "@/server/subscriptions.ts";
import { apiUser, body, handler, HttpError, json } from "@/server/session.ts";


const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown) => (Number.isInteger(v) ? (v as number) : Number.isInteger(Number(v)) && v !== "" && v !== null ? Number(v) : null);
const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

/** Media sources: a file inside the sources dir, or an http(s) URL (ffmpeg reads it directly). */
function checkSource(src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  const p = path.resolve(SOURCES_DIR, src);
  if (!p.startsWith(SOURCES_DIR + path.sep) || !fs.existsSync(p)) throw new HttpError(400, "Sorgente non trovata nella cartella sorgenti");
  return p;
}

function newMedia(b: Record<string, unknown>) {
  const intro = Number(b.introEnd) > 0 ? [Number(b.introStart) || 0, Number(b.introEnd)] as [number, number] : null;
  const id = createMedia({ source: checkSource(str(b.source)), clipStart: Number(b.clipStart) || 0, clipSeconds: Number(b.clipSeconds) || 0, hdr: !!b.hdr, intro, credits: Number(b.creditsStart) > 0 ? Number(b.creditsStart) : null });
  enqueue(id);
  return id;
}

export const POST = handler(async (req) => {
  await apiUser(req, { admin: true });
  const b = await body(req);
  const d = db();
  switch (b.action) {
    case "title.save": {
      const name = str(b.name, 120); if (!name) throw new HttpError(400, "Nome obbligatorio");
      const type = b.type === "series" ? "series" : "movie";
      const fields = [name, str(b.tagline, 200), str(b.synopsis, 4000), int(b.year), str(b.maturity, 4) || "T", str(b.credits, 400), str(b.license, 120), str(b.attribution, 300), /^#[0-9a-f]{6}$/i.test(str(b.accent)) ? str(b.accent) : "#d8a657", b.featured ? 1 : 0, b.published === false ? 0 : 1];
      let id = int(b.id);
      if (id) d.prepare("UPDATE titles SET name=?, tagline=?, synopsis=?, year=?, maturity=?, credits=?, license=?, attribution=?, accent=?, featured=?, published=? WHERE id=?").run(...fields, id);
      else {
        let slug = slugify(str(b.slug) || name) || "titolo";
        while (d.prepare("SELECT 1 FROM titles WHERE slug = ?").get(slug)) slug += "-" + Math.floor(Math.random() * 1000);
        id = Number(d.prepare("INSERT INTO titles (name,tagline,synopsis,year,maturity,credits,license,attribution,accent,featured,published,slug,type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(...fields, slug, type).lastInsertRowid);
      }
      if (Array.isArray(b.genres)) {
        d.prepare("DELETE FROM title_genres WHERE title_id = ?").run(id);
        for (const g of b.genres) if (Number.isInteger(g)) d.prepare("INSERT OR IGNORE INTO title_genres VALUES (?,?)").run(id, g);
      }
      return json({ ok: true, id });
    }
    case "title.delete": d.prepare("DELETE FROM titles WHERE id = ?").run(int(b.id)); return json({ ok: true });
    case "title.media": { // attach new media to a movie
      const id = int(b.titleId); if (!id) throw new HttpError(400, "Titolo mancante");
      const mediaId = newMedia(b); d.prepare("UPDATE titles SET media_id = ? WHERE id = ? AND type = 'movie'").run(mediaId, id);
      return json({ ok: true, mediaId });
    }
    case "season.add": {
      const t = int(b.titleId); const n = (d.prepare("SELECT COALESCE(MAX(number),0)+1 n FROM seasons WHERE title_id = ?").get(t) as { n: number }).n;
      return json({ ok: true, id: Number(d.prepare("INSERT INTO seasons (title_id, number, name) VALUES (?,?,?)").run(t, n, str(b.name, 80) || `Stagione ${n}`).lastInsertRowid) });
    }
    case "season.delete": d.prepare("DELETE FROM seasons WHERE id = ?").run(int(b.id)); return json({ ok: true });
    case "episode.add": {
      const s = int(b.seasonId); const n = (d.prepare("SELECT COALESCE(MAX(number),0)+1 n FROM episodes WHERE season_id = ?").get(s) as { n: number }).n;
      const mediaId = str(b.source) ? newMedia(b) : null;
      return json({ ok: true, id: Number(d.prepare("INSERT INTO episodes (season_id, number, name, synopsis, media_id) VALUES (?,?,?,?,?)").run(s, n, str(b.name, 120) || `Episodio ${n}`, str(b.synopsis, 2000), mediaId).lastInsertRowid), mediaId });
    }
    case "episode.update": d.prepare("UPDATE episodes SET name = ?, synopsis = ? WHERE id = ?").run(str(b.name, 120), str(b.synopsis, 2000), int(b.id)); return json({ ok: true });
    case "episode.delete": d.prepare("DELETE FROM episodes WHERE id = ?").run(int(b.id)); return json({ ok: true });
    case "media.reprocess": enqueue(int(b.id)!); return json({ ok: true });
    case "media.markers":
      d.prepare("UPDATE media SET intro_start = ?, intro_end = ?, credits_start = ? WHERE id = ?").run(Number(b.introStart) || null, Number(b.introEnd) || null, Number(b.creditsStart) || null, int(b.id));
      return json({ ok: true });
    case "user.role":
      if (b.role !== "admin" && b.role !== "user") throw new HttpError(400, "Ruolo non valido");
      d.prepare("UPDATE users SET role = ? WHERE id = ?").run(b.role, int(b.id)); return json({ ok: true });
    case "user.plan": {
      const uid = int(b.id)!;
      if (b.planId) subscribe(uid, str(b.planId), { name: "admin", charge: () => ({ ok: true, reference: "admin-grant" }) });
      else d.prepare("UPDATE subscriptions SET status = 'expired' WHERE user_id = ? AND status IN ('active','canceled')").run(uid);
      return json({ ok: true });
    }
    case "plan.save":
      d.prepare("UPDATE plans SET name = ?, description = ?, price_cents = ?, max_height = ?, hdr = ?, screens = ?, active = ? WHERE id = ?")
        .run(str(b.name, 40), str(b.description, 200), Math.max(0, int(b.priceCents) ?? 0), [720, 1080, 2160].includes(int(b.maxHeight)!) ? int(b.maxHeight) : 1080, b.hdr ? 1 : 0, Math.max(1, Math.min(10, int(b.screens) ?? 1)), b.active === false ? 0 : 1, str(b.id));
      return json({ ok: true });
    default: throw new HttpError(400, "Azione sconosciuta");
  }
});
