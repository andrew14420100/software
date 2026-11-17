import Link from "next/link";
import { euro } from "@/components/api";
import { listGenres, listTitles } from "@/server/catalog.ts";
import { db } from "@/server/db.ts";
import { requireAdminPage } from "@/server/session.ts";
import { listPlans } from "@/server/subscriptions.ts";
import { JobsLive, NewTitleForm, PlanEditor, UploadSource, UserRow } from "./AdminClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

const TABS = [["", "Panoramica"], ["titoli", "Catalogo"], ["media", "Media e code"], ["utenti", "Utenti"], ["piani", "Piani"]] as const;

export default async function Admin({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireAdminPage();
  const tab = (await searchParams).tab || "";
  const d = db();
  const n = (sql: string) => (d.prepare(sql).get() as { n: number }).n;
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
      <h1 className="font-serif text-4xl">Pannello amministrativo</h1>
      <nav className="scroll-row mt-4 flex gap-2 overflow-x-auto" aria-label="Sezioni admin">
        {TABS.map(([k, l]) => <Link key={k} href={k ? `/admin?tab=${k}` : "/admin"} className={`shrink-0 rounded-full px-4 py-1.5 text-sm ring-1 ${tab === k ? "bg-gold text-ink ring-gold" : "ring-line text-mist hover:text-cream"}`}>{l}</Link>)}
      </nav>

      {tab === "" && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4" data-testid="kpis">
            {[["Utenti", n("SELECT COUNT(*) n FROM users")], ["Abbonati attivi", n("SELECT COUNT(*) n FROM subscriptions WHERE status IN ('active','canceled') AND current_period_end > datetime('now')")],
              ["Ricavi mensili", euro(n("SELECT COALESCE(SUM(p.price_cents),0) n FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status = 'active' AND s.current_period_end > datetime('now')"))],
              ["Riproduzioni (7 gg)", n("SELECT COUNT(*) n FROM play_events WHERE created_at > datetime('now','-7 days')")],
              ["Titoli", n("SELECT COUNT(*) n FROM titles")], ["Media pronti", n("SELECT COUNT(*) n FROM media WHERE status = 'ready'")],
              ["Schermi attivi ora", n("SELECT COUNT(*) n FROM playback_sessions WHERE last_seen > datetime('now','-90 seconds')")], ["Job in coda", n("SELECT COUNT(*) n FROM jobs WHERE status IN ('queued','running')")]].map(([l, v]) => (
              <div key={String(l)} className="card p-5"><p className="text-sm text-mist">{l}</p><p className="mt-1 font-serif text-3xl">{v}</p></div>
            ))}
          </div>
          <section className="card mt-6 p-6">
            <h2 className="font-serif text-2xl">Più visti</h2>
            <ol className="mt-3 space-y-1 text-sm">
              {(d.prepare(`SELECT COALESCE(t1.name, t2.name) name, COUNT(*) n FROM play_events pe LEFT JOIN titles t1 ON t1.media_id = pe.media_id
                LEFT JOIN episodes e ON e.media_id = pe.media_id LEFT JOIN seasons s ON s.id = e.season_id LEFT JOIN titles t2 ON t2.id = s.title_id
                GROUP BY 1 ORDER BY n DESC LIMIT 8`).all() as { name: string; n: number }[]).map((r) => <li key={r.name} className="flex justify-between"><span>{r.name}</span><span className="text-mist">{r.n}</span></li>)}
            </ol>
          </section>
        </>
      )}

      {tab === "titoli" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <table className="w-full overflow-hidden rounded-2xl text-sm ring-1 ring-line">
            <thead className="bg-plum-2 text-left text-mist"><tr><th className="p-3">Titolo</th><th>Tipo</th><th>Stato</th><th>Qualità</th><th /></tr></thead>
            <tbody className="divide-y divide-line">
              {listTitles({ includeUnpublished: true, sort: "name" }).map((t) => {
                const pub = (d.prepare("SELECT published FROM titles WHERE id = ?").get(t.id) as { published: number }).published;
                return (
                  <tr key={t.id} className="bg-plum/40">
                    <td className="p-3 font-medium">{t.name}{t.featured ? <span className="ml-2 text-xs text-gold">in evidenza</span> : null}</td>
                    <td>{t.type === "series" ? "Serie" : "Film"}</td><td>{pub ? "Pubblicato" : "Bozza"}</td>
                    <td>{t.max_height ? `${t.max_height}p${t.has_hdr ? " HDR" : ""}` : "—"}</td>
                    <td className="pr-3 text-right"><Link className="text-gold hover:underline" href={`/admin/titoli/${t.id}`}>Modifica</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="card p-5"><h2 className="font-serif text-xl">Nuovo titolo</h2><NewTitleForm genres={listGenres()} /></div>
        </div>
      )}

      {tab === "media" && (
        <div className="mt-6 space-y-6">
          <div className="card p-5"><h2 className="font-serif text-xl">Carica una sorgente video</h2><p className="mt-1 text-sm text-mist">Il file viene salvato nella cartella sorgenti; poi puoi collegarlo a un film o a un episodio dalla scheda del titolo. Sono accettati anche URL http(s).</p><UploadSource /></div>
          <JobsLive />
        </div>
      )}

      {tab === "utenti" && (
        <table className="mt-6 w-full overflow-hidden rounded-2xl text-sm ring-1 ring-line">
          <thead className="bg-plum-2 text-left text-mist"><tr><th className="p-3">Utente</th><th>Ruolo</th><th>Piano</th><th>Iscritto</th></tr></thead>
          <tbody className="divide-y divide-line">
            {(d.prepare(`SELECT u.id, u.email, u.name, u.role, u.created_at, (SELECT plan_id FROM subscriptions s WHERE s.user_id = u.id AND s.status IN ('active','canceled') AND s.current_period_end > datetime('now') ORDER BY id DESC LIMIT 1) plan
              FROM users u ORDER BY u.id`).all() as { id: number; email: string; name: string; role: string; created_at: string; plan: string | null }[])
              .map((u) => <UserRow key={u.id} u={u} plans={listPlans(true).map((p) => ({ id: p.id, name: p.name }))} />)}
          </tbody>
        </table>
      )}

      {tab === "piani" && <div className="mt-6 grid gap-4 md:grid-cols-3">{listPlans(true).map((p) => <PlanEditor key={p.id} p={p} />)}</div>}
    </div>
  );
}
