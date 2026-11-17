"use client";
import Link from "next/link";
import { useState } from "react";
import { Play } from "lucide-react";
import { fmtTime } from "@/components/api";

type Ep = { id: number; season: number; number: number; name: string; synopsis: string; media_id: number | null; duration: number | null; status: string | null; progress: number };

export function SeasonTabs({ seasons, episodes, fallbackPoster }: { seasons: { id: number; number: number; name: string }[]; episodes: Ep[]; fallbackPoster: number | null }) {
  const [s, setS] = useState(seasons[0]?.number ?? 1);
  return (
    <section className="mx-auto max-w-7xl px-5 py-8 md:px-10" aria-label="Episodi">
      <div className="flex items-center gap-4">
        <h2 className="font-serif text-2xl">Episodi</h2>
        {seasons.length > 1 ? (
          <select aria-label="Stagione" value={s} onChange={(e) => setS(Number(e.target.value))} className="input !w-auto !py-1.5">
            {seasons.map((x) => <option key={x.id} value={x.number}>{x.name}</option>)}
          </select>
        ) : <span className="text-mist">{seasons[0]?.name}</span>}
      </div>
      <ol className="mt-4 divide-y divide-line overflow-hidden rounded-2xl ring-1 ring-line">
        {episodes.filter((e) => e.season === s).map((e) => {
          const ready = e.media_id && e.status === "ready";
          const inner = (
            <div className="flex gap-4 bg-plum/50 p-3 transition hover:bg-plum-2 md:p-4">
              <span className="hidden w-6 pt-6 text-center font-serif text-2xl text-mist md:block">{e.number}</span>
              <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-plum-2 md:w-48">
                {(e.media_id || fallbackPoster) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/media/${e.media_id || fallbackPoster}/thumb.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" />
                )}
                {ready && <span className="absolute inset-0 grid place-items-center bg-ink/30 opacity-0 transition group-hover:opacity-100"><Play className="h-8 w-8 fill-cream" /></span>}
                {e.progress > 0 && <div className="absolute inset-x-0 bottom-0 h-1 bg-cream/20"><div className="h-full bg-gold" style={{ width: `${e.progress * 100}%` }} /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2"><h3 className="font-medium">{e.number}. {e.name}</h3><span className="shrink-0 text-xs text-mist">{e.duration ? fmtTime(e.duration) : ready ? "" : "In elaborazione"}</span></div>
                <p className="mt-1 line-clamp-2 text-sm text-mist">{e.synopsis}</p>
              </div>
            </div>
          );
          return <li key={e.id} className="group">{ready ? <Link href={`/guarda/${e.media_id}`} data-testid="episode">{inner}</Link> : inner}</li>;
        })}
      </ol>
    </section>
  );
}
