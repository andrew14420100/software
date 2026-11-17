import { db } from "@/server/db.ts";
import { currentUser, json } from "@/server/session.ts";

export async function GET() {
  const u = await currentUser();
  if (!u || u.role !== "admin") return json({ error: "Solo amministratori" }, 403);
  const jobs = db().prepare(`SELECT j.id, j.media_id, j.status, j.step, j.updated_at, m.progress, m.source FROM jobs j JOIN media m ON m.id = j.media_id ORDER BY j.id DESC LIMIT 50`).all();
  return json({ jobs });
}
