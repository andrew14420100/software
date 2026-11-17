import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, createSession, createUser, rateLimited, validateEmail, validatePassword } from "@/server/auth.ts";
import { db } from "@/server/db.ts";
import { assertSameOrigin, body, handler, HttpError, json } from "@/server/session.ts";

export const POST = handler(async (req) => {
  await assertSameOrigin(req);
  const { email, password, name } = await body<{ email?: string; password?: string; name?: string }>(req);
  const h = await headers();
  if (rateLimited("register:" + (h.get("x-forwarded-for") || "local"), 10, 60 * 60_000)) throw new HttpError(429, "Troppe registrazioni da questa rete");
  if (typeof email !== "string" || !validateEmail(email)) throw new HttpError(400, "Email non valida");
  if (typeof password !== "string" || !validatePassword(password)) throw new HttpError(400, "La password deve avere almeno 8 caratteri");
  const n = typeof name === "string" && name.trim() ? name.trim().slice(0, 60) : email.split("@")[0];
  if (db().prepare("SELECT 1 FROM users WHERE email = ?").get(email.trim().toLowerCase())) throw new HttpError(409, "Esiste già un account con questa email");
  const id = createUser(email, n, password);
  const { token, expires } = createSession(id, h.get("user-agent"));
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.VELLUTO_INSECURE_COOKIES !== "1", path: "/", expires });
  return json({ ok: true, id }, 201);
});
