// Streaming upload of a source video into the sources directory (admin only).
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { apiUser, handler, HttpError, json } from "@/server/session.ts";
import { SOURCES_DIR } from "@/server/db.ts";

const MAX = 20 * 1024 ** 3;

export const PUT = handler(async (req) => {
  await apiUser(req, { admin: true });
  const raw = new URL(req.url).searchParams.get("name") || "";
  const name = path.basename(raw).replace(/[^\w.-]+/g, "_");
  if (!/\.(mp4|mov|mkv|webm|avi|m4v|srt|vtt)$/i.test(name)) throw new HttpError(400, "Formato non supportato");
  if (Number(req.headers.get("content-length") || 0) > MAX || !req.body) throw new HttpError(413, "File troppo grande o vuoto");
  fs.mkdirSync(SOURCES_DIR, { recursive: true });
  const dest = path.join(SOURCES_DIR, `${Date.now()}-${name}`);
  await pipeline(Readable.fromWeb(req.body as import("node:stream/web").ReadableStream), fs.createWriteStream(dest, { flags: "wx" }));
  return json({ ok: true, source: path.basename(dest), bytes: fs.statSync(dest).size }, 201);
});
