import { cookies } from "next/headers";
import { SESSION_COOKIE, deleteSession } from "@/server/auth.ts";
import { assertSameOrigin, handler, json } from "@/server/session.ts";

export const POST = handler(async (req) => {
  await assertSameOrigin(req);
  const c = await cookies();
  const t = c.get(SESSION_COOKIE)?.value;
  if (t) deleteSession(t);
  c.delete(SESSION_COOKIE);
  return json({ ok: true });
});
