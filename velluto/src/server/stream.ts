// Entitlement-aware HLS delivery: signed, short-lived tokens and per-user playlists
// that only expose the renditions the user's plan and device may play.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, DATA_DIR, MEDIA_DIR } from "./db.ts";
import { classHeight } from "./media.ts";

export type Rendition = { id: number; media_id: number; name: string; width: number; height: number; bandwidth: number; codecs: string; video_range: string; frame_rate: number };
export type Grant = { u: number; m: number; h: number; hdr: 0 | 1; s: string; exp: number };

function secret(): Buffer {
  if (process.env.VELLUTO_STREAM_SECRET) return Buffer.from(process.env.VELLUTO_STREAM_SECRET);
  const f = path.join(DATA_DIR, ".stream-secret");
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  return Buffer.from(fs.readFileSync(f, "utf8"));
}
const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signGrant(g: Omit<Grant, "exp">, ttlSeconds = 6 * 3600): string {
  const body = b64(JSON.stringify({ ...g, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return body + "." + b64(crypto.createHmac("sha256", secret()).update(body).digest());
}
export function verifyGrant(token: string | null, mediaId: number): Grant | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64(crypto.createHmac("sha256", secret()).update(body).digest());
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const g = JSON.parse(Buffer.from(body, "base64url").toString()) as Grant;
    if (g.m !== mediaId || g.exp < Date.now() / 1000) return null;
    return g;
  } catch { return null; }
}

export const renditionsOf = (mediaId: number) => db().prepare("SELECT * FROM renditions WHERE media_id = ? ORDER BY video_range, height").all(mediaId) as Rendition[];

/** Pick renditions: SDR ladder capped by plan height; HDR only if plan + device allow it. */
export function allowedRenditions(mediaId: number, maxHeight: number, hdr: boolean): Rendition[] {
  const all = renditionsOf(mediaId).filter((r) => classHeight(r.width, r.height) <= maxHeight);
  const hdrSet = all.filter((r) => r.video_range !== "SDR");
  return hdr && hdrSet.length ? hdrSet.concat(all.filter((r) => r.video_range === "SDR" && classHeight(r.width, r.height) <= 1080)) : all.filter((r) => r.video_range === "SDR");
}

export function masterPlaylist(mediaId: number, g: Grant, token: string): string {
  const rs = allowedRenditions(mediaId, g.h, !!g.hdr);
  const subs = db().prepare("SELECT * FROM subtitles WHERE media_id = ?").all(mediaId) as { id: number; lang: string; label: string }[];
  const lines = ["#EXTM3U", "#EXT-X-VERSION:7", "#EXT-X-INDEPENDENT-SEGMENTS"];
  for (const s of subs) lines.push(`#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="${s.label}",LANGUAGE="${s.lang}",AUTOSELECT=YES,DEFAULT=NO,URI="subs/${s.id}.m3u8?t=${token}"`);
  for (const r of rs) {
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},AVERAGE-BANDWIDTH=${Math.round(r.bandwidth * 0.8)},RESOLUTION=${r.width}x${r.height},FRAME-RATE=${r.frame_rate.toFixed(3)},CODECS="${r.codecs}",VIDEO-RANGE=${r.video_range}${subs.length ? ',SUBTITLES="subs"' : ""}`);
    lines.push(`v/${r.id}/index.m3u8?t=${token}`);
  }
  return lines.join("\n") + "\n";
}

export function mediaPath(mediaId: number, ...parts: string[]): string | null {
  const base = path.join(MEDIA_DIR, String(mediaId));
  const p = path.resolve(base, ...parts);
  return p.startsWith(base + path.sep) && fs.existsSync(p) ? p : null;
}

/** Variant playlist with token-bearing segment URIs. */
export function variantPlaylist(mediaId: number, r: Rendition, token: string): string | null {
  const f = mediaPath(mediaId, r.name, "index.m3u8");
  if (!f) return null;
  return fs.readFileSync(f, "utf8")
    .replace(/URI="([^"]+)"/g, (_m, u) => `URI="${u}?t=${token}"`)
    .split("\n").map((l) => (l && !l.startsWith("#") ? `${l}?t=${token}` : l)).join("\n");
}
