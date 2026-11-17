import { Grid } from "@/components/Grid";
import { listTitles } from "@/server/catalog.ts";
import { toCard } from "@/server/view.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cerca" };

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q || "").trim().slice(0, 100);
  return (
    <>
      <form className="mx-auto max-w-7xl px-5 pt-8 md:px-10" role="search">
        <label className="sr-only" htmlFor="q">Cerca</label>
        <input id="q" name="q" defaultValue={q} autoFocus placeholder="Cerca film, serie, episodi o registi" className="input !rounded-full !py-3 text-lg" />
      </form>
      {q ? <Grid title={`Risultati per “${q}”`} items={listTitles({ q }).map(toCard)} empty="Nessun risultato. Prova con un altro titolo o un nome nei crediti." /> : null}
    </>
  );
}
