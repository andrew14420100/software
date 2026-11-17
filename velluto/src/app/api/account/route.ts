import { cookies } from "next/headers";
import { SESSION_COOKIE, currentSessionId, findUserByCredentials, hashPassword, revokeSession, validatePassword } from "@/server/auth.ts";
import { db } from "@/server/db.ts";
import { apiUser, body, handler, HttpError, json } from "@/server/session.ts";

export const POST = handler(async (req) => {
  const u = await apiUser(req);
  const b = await body<{ action?: string; name?: string; autoplayNext?: boolean; current?: string; password?: string; sessionId?: string }>(req);
  switch (b.action) {
    case "profile":
      db().prepare("UPDATE users SET name = COALESCE(?, name), autoplay_next = COALESCE(?, autoplay_next) WHERE id = ?")
        .run(typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 60) : null, typeof b.autoplayNext === "boolean" ? Number(b.autoplayNext) : null, u.id);
      break;
    case "password": {
      if (!findUserByCredentials(u.email, b.current || "")) throw new HttpError(400, "Password attuale errata");
      if (!validatePassword(b.password || "")) throw new HttpError(400, "La nuova password deve avere almeno 8 caratteri");
      const keep = currentSessionId((await cookies()).get(SESSION_COOKIE)!.value);
      db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(b.password!), u.id);
      db().prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").run(u.id, keep); // log out other devices
      break;
    }
    case "revoke-session":
      if (typeof b.sessionId !== "string") throw new HttpError(400, "Sessione mancante");
      revokeSession(u.id, b.sessionId);
      break;
    default: throw new HttpError(400, "Azione non valida");
  }
  return json({ ok: true });
});
