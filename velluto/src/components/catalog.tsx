"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Heart, Info, Play } from "lucide-react";
import { api } from "./api";

export type Card = {
  id: number; slug: string; type: string; name: string; tagline: string; year: number | null; maturity: string; accent: string;
  poster_media_id: number | null; genres: string | null; max_height: number | null; has_hdr: number; progress?: number; href?: string; subtitle?: string;
};

export function QualityBadges({ h, hdr }: { h: number | null; hdr: number | boolean }) {
  return (
    <span className="inline-flex gap-1">
      {h && h >= 2160 ? <span className="badge badge-4k">4K</span> : h && h >= 1080 ? <span className="badge bg-cream/15 text-cream">HD</span> : null}
      {hdr ? <span className="badge badge-hdr">HDR10</span> : null}
    </span>
  );
}

export function TitleCard({ t, wide = false }: { t: Card; wide?: boolean }) {
  return (
    <Link href={t.href || `/titolo/${t.slug}`} className={`group relative block shrink-0 overflow-hidden rounded-xl bg-plum-2 ring-1 ring-line transition duration-300 hover:-translate-y-1 hover:ring-gold/70 ${wide ? "w-[78vw] sm:w-80" : "w-[44vw] sm:w-64"}`}
      style={{ boxShadow: `0 18px 40px -26px ${t.accent}` }}>
      <div className="relative aspect-video">
        {t.poster_media_id ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media/${t.poster_media_id}/thumb.jpg`} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : <div className="h-full w-full" style={{ background: `linear-gradient(135deg, ${t.accent}, #1d1322)` }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
        <div className="poster-shine" />
        <div className="absolute right-2 top-2"><QualityBadges h={t.max_height} hdr={t.has_hdr} /></div>
        <div className="absolute inset-x-3 bottom-2">
          <p className="font-serif text-lg leading-tight drop-shadow">{t.name}</p>
          <p className="truncate text-xs text-mist">{t.subtitle || [t.type === "series" ? "Serie" : "Film", t.year, t.genres].filter(Boolean).join(" · ")}</p>
        </div>
        {t.progress !== undefined && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-cream/20"><div className="h-full bg-gold" style={{ width: `${Math.round(t.progress * 100)}%` }} /></div>
        )}
      </div>
    </Link>
  );
}

export function Row({ title, items, wide, href }: { title: string; items: Card[]; wide?: boolean; href?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: true, right: false });
  const update = () => { const el = ref.current; if (el) setEdge({ left: el.scrollLeft < 8, right: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 }); };
  useEffect(update, [items.length]);
  if (!items.length) return null;
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });
  return (
    <section className="group/row relative mx-auto max-w-7xl py-4 animate-fade-up" aria-label={title}>
      <div className="mb-2 flex items-baseline justify-between px-5 md:px-10">
        <h2 className="font-serif text-xl md:text-2xl">{title}</h2>
        {href && <Link href={href} className="text-sm text-gold hover:underline">Vedi tutto</Link>}
      </div>
      <div ref={ref} onScroll={update} className="scroll-row flex gap-3 overflow-x-auto px-5 pb-6 pt-1 md:gap-4 md:px-10">
        {items.map((t) => <TitleCard key={`${t.id}-${t.href || ""}`} t={t} wide={wide} />)}
      </div>
      {!edge.left && <button aria-label="Scorri a sinistra" onClick={() => scroll(-1)} className="absolute left-1 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-ink/80 ring-1 ring-line hover:bg-plum md:grid"><ChevronLeft /></button>}
      {!edge.right && <button aria-label="Scorri a destra" onClick={() => scroll(1)} className="absolute right-1 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-ink/80 ring-1 ring-line hover:bg-plum md:grid"><ChevronRight /></button>}
    </section>
  );
}

export type HeroItem = Card & { synopsis: string; playHref: string | null };

export function Hero({ items }: { items: HeroItem[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (items.length < 2 || paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), 8000);
    return () => clearInterval(t);
  }, [items.length, paused]);
  if (!items.length) return null;
  return (
    <section className="relative -mt-16 h-[78vh] min-h-[480px] w-full overflow-hidden" aria-roledescription="carosello" aria-label="In evidenza"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {items.map((t, k) => (
        <div key={t.id} className={`absolute inset-0 transition-opacity duration-1000 ${k === i ? "opacity-100" : "opacity-0"}`} aria-hidden={k !== i}>
          {t.poster_media_id && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/media/${t.poster_media_id}/backdrop.jpg`} alt="" className={`h-full w-full object-cover ${k === i ? "animate-kenburns" : ""}`} />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-ink/40" />
          {k === i && (
            <div className="absolute inset-x-0 bottom-[14%] mx-auto max-w-7xl px-5 md:px-10">
              <div className="max-w-xl animate-fade-up">
                <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-gold">{t.type === "series" ? "Serie" : "Film"} · {t.year}<QualityBadges h={t.max_height} hdr={t.has_hdr} /></p>
                <h1 className="font-serif text-5xl leading-none md:text-7xl">{t.name}</h1>
                <p className="mt-4 text-lg text-cream/90">{t.tagline}</p>
                <p className="mt-2 line-clamp-2 text-sm text-mist">{t.synopsis}</p>
                <div className="mt-6 flex gap-3">
                  {t.playHref && <Link href={t.playHref} className="btn btn-gold"><Play className="h-4 w-4 fill-current" />Guarda</Link>}
                  <Link href={`/titolo/${t.slug}`} className="btn btn-ghost"><Info className="h-4 w-4" />Dettagli</Link>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="absolute bottom-6 right-5 flex gap-2 md:right-10" role="tablist">
        {items.map((t, k) => (
          <button key={t.id} role="tab" aria-selected={k === i} aria-label={`Mostra ${t.name}`} onClick={() => setI(k)}
            className={`h-1.5 rounded-full transition-all duration-500 ${k === i ? "w-8 bg-gold" : "w-3 bg-cream/40 hover:bg-cream/70"}`} />
        ))}
      </div>
    </section>
  );
}

export function FavoriteButton({ titleId, initial, loggedIn }: { titleId: number; initial: boolean; loggedIn: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <button className="btn btn-ghost" aria-pressed={on} disabled={busy}
      onClick={async () => {
        if (!loggedIn) return router.push("/accedi");
        setBusy(true); setOn(!on);
        try { await api("/api/favorites", "POST", { titleId, on: !on }); router.refresh(); } catch { setOn(on); } finally { setBusy(false); }
      }}>
      <Heart className={`h-4 w-4 transition ${on ? "fill-rose text-rose scale-110" : ""}`} />{on ? "Nella mia lista" : "La mia lista"}
    </button>
  );
}
