import { Grid } from "@/components/Grid";
import { listGenres, listTitles } from "@/server/catalog.ts";
import { currentUser } from "@/server/session.ts";
import { toCard, withProgress } from "@/server/view.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Film" };

export default async function Films({ searchParams }: { searchParams: Promise<{ ordina?: string }> }) {
  const { ordina } = await searchParams;
  const sort = ordina === "popolari" ? "popular" : ordina === "az" ? "name" : "new";
  const u = await currentUser();
  return <Grid title="Film" items={withProgress(u?.id ?? null, listTitles({ type: "movie", sort }).map(toCard))}
    chips={[{ href: "/film", label: "Novità", active: sort === "new" }, { href: "/film?ordina=popolari", label: "Più visti", active: sort === "popular" }, { href: "/film?ordina=az", label: "A–Z", active: sort === "name" },
      ...listGenres().filter((g) => g.count).map((g) => ({ href: `/genere/${g.slug}`, label: g.name }))]} />;
}
