// Token-protected HLS delivery. Every URL carries the signed grant; renditions above the
// grant (plan/device) are invisible and refused even if requested directly.
import fs from "node:fs";
import { Readable } from "node:stream";
import { db } from "@/server/db.ts";
import { allowedRenditions, masterPlaylist, mediaPath, variantPlaylist, verifyGrant } from "@/server/stream.ts";

const TYPES: Record<string, string> = { m3u8: "application/vnd.apple.mpegurl", m4s: "video/iso.segment", mp4: "video/mp4", vtt: "text/vtt; charset=utf-8", jpg: "image/jpeg" };
const deny = (status: number, msg: string) => new Response(msg, { status, headers: { "cache-control": "no-store" } });

function sendFile(file: string, req: Request) {
  const ext = file.split(".").pop() || "";
  const stat = fs.statSync(file);
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.get("range") || "");
  const headers: Record<string, string> = { "content-type": TYPES[ext] || "application/octet-stream", "accept-ranges": "bytes", "cache-control": "private, max-age=3600" };
  if (range) {
    const start = Number(range[1]), end = range[2] ? Number(range[2]) : stat.size - 1;
    if (start >= stat.size || end >= stat.size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${stat.size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${stat.size}`, "content-length": String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers: { ...headers, "content-length": String(stat.size) } });
}

export async function GET(req: Request, ctx: { params: Promise<{ mediaId: string; path: string[] }> }) {
  const { mediaId: mid, path: parts } = await ctx.params;
  const mediaId = Number(mid);
  const token = new URL(req.url).searchParams.get("t");
  const g = verifyGrant(token, mediaId);
  if (!g) return deny(403, "token non valido o scaduto");
  const p = parts.join("/");
  const text = (body: string, ext = "m3u8") => new Response(body, { headers: { "content-type": TYPES[ext], "cache-control": "no-store" } });

  if (p === "master.m3u8") return text(masterPlaylist(mediaId, g, token!));
  if (p === "storyboard.vtt") {
    const f = mediaPath(mediaId, "storyboard.vtt");
    return f ? text(fs.readFileSync(f, "utf8").replace(/storyboard\.jpg/g, `storyboard.jpg?t=${token}`), "vtt") : deny(404, "no storyboard");
  }
  if (p === "storyboard.jpg") { const f = mediaPath(mediaId, "storyboard.jpg"); return f ? sendFile(f, req) : deny(404, "missing"); }

  let m = /^subs\/(\d+)\.(m3u8|vtt)$/.exec(p);
  if (m) {
    const s = db().prepare("SELECT id FROM subtitles WHERE id = ? AND media_id = ?").get(Number(m[1]), mediaId);
    const f = s ? mediaPath(mediaId, "subs", `${m[1]}.${m[2]}`) : null;
    if (!f) return deny(404, "missing");
    return m[2] === "m3u8" ? text(fs.readFileSync(f, "utf8").replace(/^(\d+\.vtt)$/m, `$1?t=${token}`)) : sendFile(f, req);
  }

  m = /^v\/(\d+)\/([\w.-]+)$/.exec(p);
  if (m) {
    const r = allowedRenditions(mediaId, g.h, !!g.hdr).find((x) => x.id === Number(m![1]));
    if (!r) return deny(403, "qualità non inclusa nel piano");
    if (m[2] === "index.m3u8") { const pl = variantPlaylist(mediaId, r, token!); return pl ? text(pl) : deny(404, "missing"); }
    if (!/^(init\.mp4|seg_\d{4}\.m4s)$/.test(m[2])) return deny(404, "missing");
    const f = mediaPath(mediaId, r.name, m[2]);
    return f ? sendFile(f, req) : deny(404, "missing");
  }
  return deny(404, "not found");
}
