// Creates deterministic e2e accounts (idempotent) directly in the app database.
import { db } from "../src/server/db.ts";
import { createUser } from "../src/server/auth.ts";
import { subscribe } from "../src/server/subscriptions.ts";

export const PASSWORD = "e2e-password-123";
export const USERS = { basic: "e2e-basic@velluto.test", plus: "e2e-plus@velluto.test", ultra: "e2e-ultra@velluto.test", admin: "e2e-admin@velluto.test", none: "e2e-none@velluto.test" } as const;

export default async function setup() {
  const d = db();
  const plan: Record<string, string | null> = { basic: "essenziale", plus: "plus", ultra: "ultra", admin: "ultra", none: null };
  for (const [k, email] of Object.entries(USERS)) {
    d.prepare("DELETE FROM users WHERE email = ?").run(email);
    const id = createUser(email, `E2E ${k}`, PASSWORD, k === "admin" ? "admin" : "user");
    if (plan[k]) subscribe(id, plan[k]!);
  }
  d.prepare("DELETE FROM users WHERE email LIKE 'e2e-new-%'").run();
  d.prepare("DELETE FROM playback_sessions").run();
}
