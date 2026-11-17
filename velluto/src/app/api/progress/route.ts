// Progress + playback heartbeat (also accepts navigator.sendBeacon text/plain bodies).
import { saveProgress } from "@/server/catalog.ts";
import { closePlayback, heartbeatPlayback } from "@/server/subscriptions.ts";
import { apiUser, handler, HttpError, json } from "@/server/session.ts";

export const POST = handler(async (req) => {
  const u = await apiUser(req);
  let b: { mediaId?: number; position?: number; duration?: number; playbackId?: string; close?: boolean };
  try { b = JSON.parse(await req.text()); } catch { throw new HttpError(400, "JSON non valido"); }
  if (!Number.isInteger(b.mediaId) || typeof b.position !== "number" || typeof b.duration !== "number") throw new HttpError(400, "Parametri non validi");
  saveProgress(u.id, b.mediaId!, b.position, b.duration);
  if (b.close && b.playbackId) { closePlayback(u.id, b.playbackId); return json({ ok: true, closed: true }); } // tab closed/reloaded (sendBeacon)
  const alive = b.playbackId ? heartbeatPlayback(u.id, b.playbackId) : true;
  return json({ ok: true, alive });
});
