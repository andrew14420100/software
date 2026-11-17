import Link from "next/link";
import { notFound } from "next/navigation";
import { listGenres, seasonsOf, titleGenreIds } from "@/server/catalog.ts";
import { db } from "@/server/db.ts";
import { requireAdminPage } from "@/server/session.ts";
import { AddEpisode, AttachMedia, DeleteButton, MediaRow, SeasonActions, TitleEditor } from "../../AdminClient";

export const dynamic = "force-dynamic";

type MediaInfo = { id: number; status: string; progress: number; max_height: number | null; has_hdr: number; duration: number | null; error: string | null; intro_end: number | null; credits_start: number | null };
const mediaOf = (id: number | null) => (id ? (db().prepare("SELECT id, status, progress, max_height, has_hdr, duration, error, intro_end, credits_start FROM media WHERE id = ?").get(id) as MediaInfo) : null);

export default async function EditTitle({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const id = Number((await params).id);
  const t = db().prepare("SELECT * FROM titles WHERE id = ?").get(id) as Record<string, string | number | null> | undefined;
  if (!t) notFound();
  const media = mediaOf(t.media_id as number | null);
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 md:px-10">
      <div className="flex items-center justify-between"><Link href="/admin?tab=titoli" className="text-sm text-gold hover:underline">← Catalogo</Link><Link href={`/titolo/${t.slug}`} className="text-sm text-gold hover:underline">Vedi scheda pubblica</Link></div>
      <h1 className="font-serif text-4xl">{t.name}</h1>
      <section className="card p-6"><TitleEditor t={t} genres={listGenres()} selected={titleGenreIds(id)} /></section>

      {t.type === "movie" ? (
        <section className="card space-y-3 p-6">
          <h2 className="font-serif text-2xl">Video</h2>
          {media ? <MediaRow m={media} /> : <p className="text-sm text-mist">Nessun video collegato.</p>}
          <AttachMedia titleId={id} />
        </section>
      ) : (
        <section className="card space-y-4 p-6">
          <div className="flex items-center justify-between"><h2 className="font-serif text-2xl">Stagioni ed episodi</h2><SeasonActions titleId={id} /></div>
          {seasonsOf(id).map((s) => (
            <div key={s.id} className="rounded-xl p-4 ring-1 ring-line">
              <div className="flex items-center justify-between"><h3 className="font-medium">{s.name}</h3><DeleteButton action="season.delete" id={s.id} label="Elimina stagione" /></div>
              <ol className="mt-2 space-y-2">
                {(db().prepare("SELECT * FROM episodes WHERE season_id = ? ORDER BY number").all(s.id) as { id: number; number: number; name: string; media_id: number | null }[]).map((e) => {
                  const m = mediaOf(e.media_id);
                  return (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-plum-2/60 px-3 py-2">
                      <span>{e.number}. {e.name}</span>
                      <span className="flex items-center gap-4">{m ? <MediaRow m={m} /> : <span className="text-xs text-mist">senza video</span>}<DeleteButton action="episode.delete" id={e.id} label="Elimina" /></span>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-3"><AddEpisode seasonId={s.id} /></div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
