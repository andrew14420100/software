// Start playback: checks subscription, plan quality/HDR, concurrent screens; returns a signed stream URL.
import { headers } from "next/headers";
import { mediaContext, progressOf } from "@/server/catalog.ts";
import { db } from "@/server/db.ts";
import { allowedRenditions, signGrant } from "@/server/stream.ts";
import { activeSubscription, closePlayback, openPlayback } from "@/server/subscriptions.ts";
import { apiUser, body, handler, HttpError, json } from "@/server/session.ts";

type Caps = { hdr?: boolean; hevc?: boolean; maxHeight?: number };

export const POST = handler(async (req) => {
  const u = await apiUser(req);
  const { mediaId, caps = {}, playbackId } = await body<{ mediaId?: number; caps?: Caps; playbackId?: string }>(req);
  const m = db().prepare("SELECT id, status, duration, intro_start, intro_end, credits_start FROM media WHERE id = ?").get(mediaId) as
    { id: number; status: string; duration: number; intro_start: number | null; intro_end: number | null; credits_start: number | null } | undefined;
  const ctx = m ? mediaContext(m.id) : null;
  if (!m || !ctx) throw new HttpError(404, "Contenuto non trovato");
  if (m.status !== "ready") throw new HttpError(409, "Contenuto in elaborazione");
  const sub = activeSubscription(u.id);
  if (!sub) throw new HttpError(402, "Serve un abbonamento attivo per guardare questo contenuto");

  const device = ((await headers()).get("user-agent") || "").slice(0, 200);
  const pb = openPlayback(u.id, m.id, device, sub.plan.screens, playbackId);
  if (!pb.ok) throw new HttpError(429, `Hai già ${pb.active} schermi attivi: il piano ${sub.plan.name} ne consente ${sub.plan.screens}`);

  // device caps can only lower what the plan grants, never raise it
  const maxH = Math.min(sub.plan.max_height, caps.maxHeight && caps.maxHeight >= 360 ? caps.maxHeight : 2160);
  const hdr = !!(sub.plan.hdr && caps.hdr && caps.hevc);
  const renditions = allowedRenditions(m.id, maxH, hdr);
  if (!renditions.length) throw new HttpError(409, "Nessuna qualità disponibile per questo dispositivo");
  const token = signGrant({ u: u.id, m: m.id, h: maxH, hdr: hdr ? 1 : 0, s: pb.id });
  const p = progressOf(u.id, m.id);

  return json({
    playbackId: pb.id,
    src: `/api/stream/${m.id}/master.m3u8?t=${token}`,
    storyboard: `/api/stream/${m.id}/storyboard.vtt?t=${token}`,
    duration: m.duration,
    resume: p && !p.completed && p.position > 5 ? p.position : 0,
    intro: m.intro_end ? { start: m.intro_start ?? 0, end: m.intro_end } : null,
    creditsStart: m.credits_start,
    plan: { name: sub.plan.name, maxHeight: sub.plan.max_height, hdr: !!sub.plan.hdr },
    delivered: { maxHeight: Math.max(...renditions.map((r) => r.height)), hdr },
    title: ctx.title, episode: ctx.episode, next: ctx.next,
    autoplayNext: !!u.autoplay_next,
  });
});

export const DELETE = handler(async (req) => {
  const u = await apiUser(req);
  const text = await req.text();
  const { playbackId } = text ? (JSON.parse(text) as { playbackId?: string }) : {};
  if (playbackId) closePlayback(u.id, playbackId);
  return json({ ok: true });
});
