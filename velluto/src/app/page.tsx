import Link from "next/link";
import { Check, MonitorSmartphone, Sparkles, Tv } from "lucide-react";
import { Hero, Row } from "@/components/catalog";
import { euro } from "@/components/api";
import { favorites, listGenres, listTitles, resumeTarget } from "@/server/catalog.ts";
import { currentUser } from "@/server/session.ts";
import { listPlans } from "@/server/subscriptions.ts";
import { continueWatching, toCard, withProgress } from "@/server/view.ts";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  const all = listTitles();
  const featured = all.filter((t) => t.featured).map((t) => {
    const r = resumeTarget(user?.id ?? null, t.id);
    return { ...toCard(t), synopsis: t.synopsis, playHref: r ? `/guarda/${r.media_id}` : null };
  });

  if (!user) return <Landing featured={featured} />;

  const cards = (xs: typeof all) => withProgress(user.id, xs.map(toCard));
  return (
    <>
      <Hero items={featured} />
      <div className="relative z-10 -mt-24 space-y-2">
        <Row title="Continua a guardare" items={continueWatching(user.id)} wide />
        <Row title="La mia lista" items={cards(favorites(user.id))} href="/la-mia-lista" />
        <Row title="Di tendenza su Velluto" items={cards(listTitles({ sort: "popular", limit: 12 }))} />
        <Row title="In 4K e HDR" items={cards(all.filter((t) => (t.max_height || 0) >= 2160))} />
        <Row title="Serie da guardare tutte d'un fiato" items={cards(listTitles({ type: "series" }))} href="/serie" />
        {listGenres().filter((g) => g.count > 1).map((g) => <Row key={g.id} title={g.name} items={cards(listTitles({ genre: g.slug }))} href={`/genere/${g.slug}`} />)}
      </div>
    </>
  );
}

function Landing({ featured }: { featured: Parameters<typeof Hero>[0]["items"] }) {
  const plans = listPlans();
  return (
    <>
      <Hero items={featured.map((f) => ({ ...f, playHref: null }))} />
      <section className="mx-auto max-w-7xl px-5 py-14 md:px-10">
        <div className="max-w-2xl animate-fade-up">
          <h2 className="font-serif text-4xl md:text-5xl">Il cinema indipendente, morbido come il velluto.</h2>
          <p className="mt-4 text-lg text-mist">Film e serie in streaming adattivo fino al 4K HDR10, sottotitoli, ripresa dal punto in cui eri rimasto e riproduzione automatica degli episodi. Su computer, tablet e smartphone.</p>
          <div className="mt-6 flex flex-wrap gap-3"><Link href="/registrati" className="btn btn-gold">Crea un account</Link><Link href="/film" className="btn btn-ghost">Sfoglia il catalogo</Link></div>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[{ i: Sparkles, t: "4K Ultra HD e HDR10", d: "Qualità che si adatta alla rete e al dispositivo, con HDR dove il display lo supporta." },
            { i: MonitorSmartphone, t: "Ovunque tu sia", d: "Interfaccia pensata per desktop, tablet e smartphone, con gesti touch nel player." },
            { i: Tv, t: "Le tue serie, senza interruzioni", d: "Salta l'intro, episodio successivo automatico, cronologia e La mia lista." }].map((f) => (
            <div key={f.t} className="card p-6"><f.i className="h-6 w-6 text-gold" /><h3 className="mt-3 font-serif text-xl">{f.t}</h3><p className="mt-1 text-sm text-mist">{f.d}</p></div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 pb-16 md:px-10" id="piani">
        <h2 className="font-serif text-3xl">Scegli il tuo piano</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className={`card p-6 ${p.hdr ? "ring-1 ring-gold" : ""}`}>
              <p className="text-sm uppercase tracking-widest text-gold">{p.name}</p>
              <p className="mt-2 font-serif text-4xl">{euro(p.price_cents)}<span className="text-base text-mist"> /mese</span></p>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex gap-2"><Check className="h-4 w-4 text-gold" />Fino a {p.max_height >= 2160 ? "4K Ultra HD" : `${p.max_height}p`}</li>
                <li className="flex gap-2"><Check className="h-4 w-4 text-gold" />{p.screens} {p.screens > 1 ? "schermi" : "schermo"} in contemporanea</li>
                {p.hdr ? <li className="flex gap-2"><Check className="h-4 w-4 text-gold" />HDR10</li> : null}
              </ul>
              <Link href={`/registrati?plan=${p.id}`} className={`btn mt-6 w-full ${p.hdr ? "btn-gold" : "btn-ghost"}`}>Inizia con {p.name}</Link>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
