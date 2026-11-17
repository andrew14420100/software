// Plans, subscriptions, demo payment provider and playback entitlements.
import crypto from "node:crypto";
import { db, sqlTime } from "./db.ts";

export type Plan = { id: string; name: string; description: string; price_cents: number; max_height: number; hdr: number; screens: number; sort: number; active: number };
export type Subscription = { id: number; user_id: number; plan_id: string; status: string; started_at: string; current_period_end: string; cancel_at_period_end: number };

export const listPlans = (all = false) => db().prepare(`SELECT * FROM plans ${all ? "" : "WHERE active = 1"} ORDER BY sort`).all() as Plan[];
export const getPlan = (id: string) => db().prepare("SELECT * FROM plans WHERE id = ?").get(id) as Plan | undefined;

/** Expire subscriptions whose period ended and that were set to cancel. */
function sweep(userId: number) {
  db().prepare(`UPDATE subscriptions SET status = 'expired' WHERE user_id = ? AND status IN ('active','canceled') AND current_period_end <= datetime('now')`).run(userId);
}

export function activeSubscription(userId: number): (Subscription & { plan: Plan }) | null {
  sweep(userId);
  const s = db().prepare(`SELECT * FROM subscriptions WHERE user_id = ? AND status IN ('active','canceled') ORDER BY id DESC LIMIT 1`).get(userId) as Subscription | undefined;
  if (!s) return null;
  return { ...s, plan: getPlan(s.plan_id)! };
}

/**
 * Payment provider interface. The bundled "demo" provider never touches real money
 * or card data: it records a simulated, always-successful charge. A real provider
 * (e.g. Stripe, Mollie) can implement the same interface.
 */
export interface PaymentProvider { name: string; charge(userId: number, plan: Plan): { ok: boolean; reference: string } }
export const demoProvider: PaymentProvider = { name: "demo", charge: () => ({ ok: true, reference: "demo_" + crypto.randomBytes(6).toString("hex") }) };

export function subscribe(userId: number, planId: string, provider: PaymentProvider = demoProvider) {
  const plan = getPlan(planId);
  if (!plan || !plan.active) throw new Error("Piano non disponibile");
  const charge = provider.charge(userId, plan);
  const d = db();
  return d.transaction(() => {
    d.prepare("INSERT INTO payments (user_id, plan_id, amount_cents, provider, status, reference) VALUES (?,?,?,?,?,?)").run(userId, plan.id, plan.price_cents, provider.name, charge.ok ? "paid" : "failed", charge.reference);
    if (!charge.ok) throw new Error("Pagamento rifiutato");
    const cur = activeSubscription(userId);
    if (cur) {
      // plan change: takes effect immediately, keeps the current period end
      d.prepare("UPDATE subscriptions SET plan_id = ?, status = 'active', cancel_at_period_end = 0 WHERE id = ?").run(plan.id, cur.id);
      return cur.id;
    }
    const end = new Date(Date.now() + 30 * 864e5);
    return Number(d.prepare("INSERT INTO subscriptions (user_id, plan_id, status, current_period_end) VALUES (?,?, 'active', ?)").run(userId, plan.id, sqlTime(end)).lastInsertRowid);
  })();
}

export function cancelSubscription(userId: number) {
  db().prepare("UPDATE subscriptions SET status = 'canceled', cancel_at_period_end = 1 WHERE user_id = ? AND status = 'active'").run(userId);
}
export function resumeSubscription(userId: number) {
  db().prepare("UPDATE subscriptions SET status = 'active', cancel_at_period_end = 0 WHERE user_id = ? AND status = 'canceled' AND current_period_end > datetime('now')").run(userId);
}
export const listPayments = (userId: number) => db().prepare("SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC").all(userId) as { id: number; plan_id: string; amount_cents: number; provider: string; status: string; reference: string; created_at: string }[];

/** Concurrent-screen enforcement: a playback session is alive while its heartbeat is fresh. */
const ALIVE = "-90 seconds";
export function openPlayback(userId: number, mediaId: number, device: string, screens: number, reuseId?: string | null): { ok: true; id: string } | { ok: false; active: number } {
  const d = db();
  d.prepare(`DELETE FROM playback_sessions WHERE last_seen < datetime('now', ?)`).run(ALIVE);
  if (reuseId) {
    const r = d.prepare("UPDATE playback_sessions SET media_id = ?, last_seen = datetime('now') WHERE id = ? AND user_id = ?").run(mediaId, reuseId, userId);
    if (r.changes) return { ok: true, id: reuseId };
  }
  const active = (d.prepare("SELECT COUNT(*) n FROM playback_sessions WHERE user_id = ?").get(userId) as { n: number }).n;
  if (active >= screens) return { ok: false, active };
  const id = crypto.randomBytes(12).toString("base64url");
  d.prepare("INSERT INTO playback_sessions (id, user_id, media_id, device) VALUES (?,?,?,?)").run(id, userId, mediaId, device.slice(0, 200));
  d.prepare("INSERT INTO play_events (user_id, media_id) VALUES (?,?)").run(userId, mediaId);
  return { ok: true, id };
}
export function heartbeatPlayback(userId: number, id: string): boolean {
  return db().prepare("UPDATE playback_sessions SET last_seen = datetime('now') WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}
export function closePlayback(userId: number, id: string) { db().prepare("DELETE FROM playback_sessions WHERE id = ? AND user_id = ?").run(id, userId); }
