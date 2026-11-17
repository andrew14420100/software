import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, clearFailures, createSession, findUserByCredentials, isBlocked, recordFailure } from "@/server/auth.ts";
import { assertSameOrigin, body, handler, HttpError, json } from "@/server/session.ts";

export const POST = handler(async (req) => {
  await assertSameOrigin(req);
  const { email, password } = await body<{ email?: string; password?: string }>(req);
  if (typeof email !== "string" || typeof password !== "string") throw new HttpError(400, "Email e password obbligatorie");
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "local").split(",")[0].trim();
  const ek = "email:" + email.toLowerCase(), ik = "ip:" + ip;
  if (isBlocked(ik, 30) || isBlocked(ek, 8)) throw new HttpError(429, "Troppi tentativi, riprova tra qualche minuto");
  const user = findUserByCredentials(email, password);
  if (!user) { recordFailure(ik); recordFailure(ek); throw new HttpError(401, "Credenziali non valide"); }
  clearFailures(ek);
  const { token, expires } = createSession(user.id, h.get("user-agent"));
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.VELLUTO_INSECURE_COOKIES !== "1", path: "/", expires });
  return json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
});
