import { setFavorite } from "@/server/catalog.ts";
import { db } from "@/server/db.ts";
import { apiUser, body, handler, HttpError, json } from "@/server/session.ts";

export const POST = handler(async (req) => {
  const u = await apiUser(req);
  const { titleId, on } = await body<{ titleId?: number; on?: boolean }>(req);
  if (!Number.isInteger(titleId) || !db().prepare("SELECT 1 FROM titles WHERE id = ?").get(titleId)) throw new HttpError(404, "Titolo inesistente");
  setFavorite(u.id, titleId!, on !== false);
  return json({ ok: true, favorite: on !== false });
});
