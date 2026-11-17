import Link from "next/link";
import { TitleCard, type Card } from "./catalog";

export function Grid({ title, items, empty, chips }: { title: string; items: Card[]; empty?: React.ReactNode; chips?: { href: string; label: string; active?: boolean }[] }) {
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
      <h1 className="font-serif text-4xl">{title}</h1>
      {chips && (
        <div className="scroll-row mt-4 flex gap-2 overflow-x-auto pb-1">
          {chips.map((c) => <Link key={c.href} href={c.href} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ring-1 ${c.active ? "bg-gold text-ink ring-gold" : "ring-line text-mist hover:text-cream"}`}>{c.label}</Link>)}
        </div>
      )}
      {items.length ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 [&>a]:!w-full">
          {items.map((t) => <TitleCard key={t.id} t={t} />)}
        </div>
      ) : <div className="mt-10 text-mist">{empty || "Nessun titolo trovato."}</div>}
    </div>
  );
}
