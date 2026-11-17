import { removeHistory } from "@/server/catalog.ts";
import { apiUser, body, handler, json } from "@/server/session.ts";

export const DELETE = handler(async (req) => {
  const u = await apiUser(req);
  const { mediaId } = await body<{ mediaId?: number }>(req).catch(() => ({ mediaId: undefined }));
  removeHistory(u.id, Number.isInteger(mediaId) ? mediaId : undefined);
  return json({ ok: true });
});
