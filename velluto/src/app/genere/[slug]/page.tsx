import { notFound } from "next/navigation";
import { Grid } from "@/components/Grid";
import { listGenres, listTitles } from "@/server/catalog.ts";
import { currentUser } from "@/server/session.ts";
import { toCard, withProgress } from "@/server/view.ts";

export const dynamic = "force-dynamic";

export default async function Genre({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const genres = listGenres();
  const g = genres.find((x) => x.slug === slug);
  if (!g) notFound();
  const u = await currentUser();
  return <Grid title={g.name} items={withProgress(u?.id ?? null, listTitles({ genre: slug }).map(toCard))}
    chips={genres.filter((x) => x.count).map((x) => ({ href: `/genere/${x.slug}`, label: x.name, active: x.slug === slug }))} />;
}
