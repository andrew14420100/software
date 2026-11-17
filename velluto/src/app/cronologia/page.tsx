import Link from "next/link";
import { HistoryRemove } from "@/components/AccountActions";
import { fmtTime } from "@/components/api";
import { history } from "@/server/catalog.ts";
import { requireUserPage } from "@/server/session.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cronologia" };

export default async function History() {
  const u = await requireUserPage("/cronologia");
  const items = history(u.id);
  return (
    <div className="mx-auto max-w-4xl px-5 py-10 md:px-10">
      <div className="flex items-center justify-between gap-4"><h1 className="font-serif text-4xl">Cronologia</h1>{items.length > 0 && <HistoryRemove />}</div>
      {items.length ? (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl ring-1 ring-line" data-testid="history">
          {items.map((h) => (
            <li key={h.media_id} className="flex items-center gap-4 bg-plum/50 p-3">
              <Link href={`/guarda/${h.media_id}`} className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/media/${h.media_id}/thumb.jpg`} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 h-1 bg-cream/20"><div className="h-full bg-gold" style={{ width: `${(h.position / h.duration) * 100}%` }} /></div>
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/titolo/${h.slug}`} className="font-medium hover:text-gold">{h.title}</Link>
                {h.episode && <p className="text-sm text-mist">S{h.season}:E{h.number} · {h.episode}</p>}
                <p className="text-xs text-mist">{h.completed ? "Visto" : `${fmtTime(h.position)} di ${fmtTime(h.duration)}`} · {new Date(h.updated_at + "Z").toLocaleString("it-IT")}</p>
              </div>
              <HistoryRemove mediaId={h.media_id} />
            </li>
          ))}
        </ul>
      ) : <p className="mt-6 text-mist">Non hai ancora guardato nulla.</p>}
    </div>
  );
}
