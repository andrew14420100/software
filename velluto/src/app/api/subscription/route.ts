import { cancelSubscription, resumeSubscription, subscribe } from "@/server/subscriptions.ts";
import { apiUser, body, handler, HttpError, json } from "@/server/session.ts";

export const POST = handler(async (req) => {
  const u = await apiUser(req);
  const { action, planId } = await body<{ action?: string; planId?: string }>(req);
  if (action === "subscribe") {
    if (typeof planId !== "string") throw new HttpError(400, "Piano mancante");
    try { subscribe(u.id, planId); } catch (e) { throw new HttpError(400, (e as Error).message); }
  } else if (action === "cancel") cancelSubscription(u.id);
  else if (action === "resume") resumeSubscription(u.id);
  else throw new HttpError(400, "Azione non valida");
  return json({ ok: true });
});
