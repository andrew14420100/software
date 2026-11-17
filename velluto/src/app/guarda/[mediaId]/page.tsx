import { notFound } from "next/navigation";
import { db } from "@/server/db.ts";
import { requireUserPage } from "@/server/session.ts";
import { Player } from "./Player";

export const dynamic = "force-dynamic";
export const metadata = { title: "In riproduzione" };

export default async function Watch({ params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  const id = Number(mediaId);
  await requireUserPage(`/guarda/${mediaId}`);
  if (!Number.isInteger(id) || !db().prepare("SELECT 1 FROM media WHERE id = ?").get(id)) notFound();
  return <Player mediaId={id} />;
}
