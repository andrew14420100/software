import type { TitleCard } from "./catalog.ts";
import { history, progressMap, resumeTarget } from "./catalog.ts";

export const toCard = (t: TitleCard) => ({
  id: t.id, slug: t.slug, type: t.type, name: t.name, tagline: t.tagline, year: t.year, maturity: t.maturity, accent: t.accent,
  poster_media_id: t.poster_media_id, genres: t.genres, max_height: t.max_height, has_hdr: t.has_hdr,
});

/** "Continua a guardare" row: one card per title, pointing straight at the player. */
export function continueWatching(userId: number) {
  const seen = new Set<string>();
  return history(userId, { onlyInProgress: true, limit: 40 }).filter((h) => (seen.has(h.slug) ? false : (seen.add(h.slug), true))).map((h) => ({
    id: h.media_id, slug: h.slug, type: h.type, name: h.title, tagline: "", year: null, maturity: "", accent: h.accent,
    poster_media_id: h.media_id, genres: null, max_height: null, has_hdr: 0, progress: h.position / h.duration,
    href: `/guarda/${h.media_id}`, subtitle: h.episode ? `S${h.season}:E${h.number} · ${h.episode}` : `Restano ${Math.max(1, Math.round((h.duration - h.position) / 60))} min`,
  }));
}

export function withProgress(userId: number | null, cards: ReturnType<typeof toCard>[]) {
  if (!userId) return cards;
  const pm = progressMap(userId);
  return cards.map((c) => { const r = resumeTarget(userId, c.id); const p = r && pm.get(r.media_id); return p && !p.completed ? { ...c, progress: p.position / p.duration } : c; });
}
