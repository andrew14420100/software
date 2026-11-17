import Link from "next/link";
import { notFound } from "next/navigation";
import { Play } from "lucide-react";
import { FavoriteButton, QualityBadges, Row } from "@/components/catalog";
import { fmtTime } from "@/components/api";
import { episodesOf, getTitle, isFavorite, listTitles, progressMap, resumeTarget, seasonsOf, titleExtra } from "@/server/catalog.ts";
import { currentUser } from "@/server/session.ts";
import { toCard } from "@/server/view.ts";
import { SeasonTabs } from "./SeasonTabs";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const t = getTitle((await params).slug);
  return { title: t?.name || "Titolo", description: t?.tagline };
}

export default async function TitlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = getTitle(slug);
  const user = await currentUser();
  if (!t || (!t.published && user?.role !== "admin")) notFound();
  const extra = titleExtra(t.id);
  const target = resumeTarget(user?.id ?? null, t.id);
  const pm = user ? progressMap(user.id) : new Map();
  const tp = target && pm.get(target.media_id);
  const started = tp && !tp.completed && tp.position > 5;
  const episodes = t.type === "series" ? episodesOf(t.id).map((e) => ({ ...e, progress: e.media_id && pm.get(e.media_id) ? pm.get(e.media_id)!.position / pm.get(e.media_id)!.duration : 0 })) : [];
  const similar = listTitles({ limit: 12 }).filter((x) => x.id !== t.id && x.genres && t.genres && x.genres.split(" · ").some((g) => t.genres!.includes(g))).map(toCard);

  return (
    <article>
      <div className="relative -mt-16 min-h-[70vh] overflow-hidden">
        {t.poster_media_id && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media/${t.poster_media_id}/backdrop.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover animate-kenburns" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/75 to-ink/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-transparent" />
        <div className="relative mx-auto flex min-h-[70vh] max-w-7xl flex-col justify-end px-5 pb-12 pt-28 md:px-10">
          <div className="max-w-2xl animate-fade-up">
            <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-mist">
              <span className="rounded border border-mist/50 px-1.5 text-xs">{t.maturity}</span>{t.year}<span>·</span>{t.type === "series" ? `${episodes.length} episodi` : t.duration ? fmtTime(t.duration) : ""}<span>·</span>{t.genres}<QualityBadges h={t.max_height} hdr={t.has_hdr} />
            </p>
            <h1 className="font-serif text-5xl leading-none md:text-7xl" style={{ textShadow: `0 10px 50px ${t.accent}66` }}>{t.name}</h1>
            <p className="mt-4 text-xl text-cream/90">{t.tagline}</p>
            <p className="mt-3 text-mist">{t.synopsis}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              {target ? (
                <Link href={`/guarda/${target.media_id}`} className="btn btn-gold" data-testid="play">
                  <Play className="h-4 w-4 fill-current" />{started ? "Riprendi" : "Guarda"} {target.label}
                </Link>
              ) : <span className="btn btn-ghost">In arrivo</span>}
              <FavoriteButton titleId={t.id} initial={user ? isFavorite(user.id, t.id) : false} loggedIn={!!user} />
            </div>
            {started && <div className="mt-4 h-1 w-64 overflow-hidden rounded bg-cream/20"><div className="h-full bg-gold" style={{ width: `${(tp!.position / tp!.duration) * 100}%` }} /></div>}
          </div>
        </div>
      </div>

      {t.type === "series" && <SeasonTabs seasons={seasonsOf(t.id)} episodes={episodes} fallbackPoster={t.poster_media_id} />}

      <section className="mx-auto max-w-7xl px-5 py-6 text-sm text-mist md:px-10">
        <h2 className="mb-2 font-serif text-xl text-cream">Crediti e licenza</h2>
        <p>{extra.credits}</p>
        <p>{extra.attribution} — Licenza {extra.license}</p>
      </section>
      <Row title="Potrebbe piacerti anche" items={similar} />
    </article>
  );
}
