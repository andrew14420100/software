import Link from "next/link";
import { Grid } from "@/components/Grid";
import { favorites } from "@/server/catalog.ts";
import { requireUserPage } from "@/server/session.ts";
import { toCard, withProgress } from "@/server/view.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "La mia lista" };

export default async function MyList() {
  const u = await requireUserPage("/la-mia-lista");
  return <Grid title="La mia lista" items={withProgress(u.id, favorites(u.id).map(toCard))}
    empty={<>La tua lista è vuota. Aggiungi titoli con il pulsante <b>La mia lista</b> nelle schede. <Link href="/film" className="text-gold hover:underline">Sfoglia i film</Link></>} />;
}
