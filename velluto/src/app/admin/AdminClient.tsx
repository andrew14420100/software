"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Msg, useAction } from "@/components/AccountActions";

const A = "/api/admin";

export function NewTitleForm({ genres }: { genres: { id: number; name: string }[] }) {
  const [err, setErr] = useState("");
  const router = useRouter();
  return (
    <form className="mt-3 space-y-3" onSubmit={async (e) => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      const res = await fetch(A, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "title.save", name: f.get("name"), type: f.get("type"), tagline: f.get("tagline"), synopsis: f.get("synopsis"), year: Number(f.get("year")) || null, genres: f.getAll("genres").map(Number), published: false }) });
      const j = await res.json(); if (res.ok) router.push(`/admin/titoli/${j.id}`); else setErr(j.error || "Errore");
    }}>
      <input name="name" required placeholder="Titolo" className="input" />
      <select name="type" className="input"><option value="movie">Film</option><option value="series">Serie</option></select>
      <input name="tagline" placeholder="Frase di lancio" className="input" />
      <textarea name="synopsis" placeholder="Sinossi" className="input min-h-24" />
      <input name="year" type="number" placeholder="Anno" className="input" />
      <fieldset className="flex flex-wrap gap-2 text-sm">{genres.map((g) => <label key={g.id} className="flex items-center gap-1"><input type="checkbox" name="genres" value={g.id} />{g.name}</label>)}</fieldset>
      <button className="btn btn-gold w-full">Crea (come bozza)</button><Msg msg={err ? { ok: false, text: err } : null} />
    </form>
  );
}

export function TitleEditor({ t, genres, selected }: { t: Record<string, string | number | null>; genres: { id: number; name: string }[]; selected: number[] }) {
  const { busy, msg, run } = useAction();
  const router = useRouter();
  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      run(A, "POST", { action: "title.save", id: t.id, name: f.get("name"), tagline: f.get("tagline"), synopsis: f.get("synopsis"), year: Number(f.get("year")) || null, maturity: f.get("maturity"), credits: f.get("credits"), license: f.get("license"), attribution: f.get("attribution"), accent: f.get("accent"), featured: f.get("featured") === "on", published: f.get("published") === "on", genres: f.getAll("genres").map(Number) }, "Salvato");
    }}>
      <label className="text-sm">Titolo<input name="name" defaultValue={String(t.name)} className="input mt-1" /></label>
      <label className="text-sm">Frase di lancio<input name="tagline" defaultValue={String(t.tagline)} className="input mt-1" /></label>
      <label className="text-sm md:col-span-2">Sinossi<textarea name="synopsis" defaultValue={String(t.synopsis)} className="input mt-1 min-h-24" /></label>
      <label className="text-sm">Anno<input name="year" type="number" defaultValue={t.year ?? ""} className="input mt-1" /></label>
      <label className="text-sm">Classificazione<input name="maturity" defaultValue={String(t.maturity)} className="input mt-1" /></label>
      <label className="text-sm">Crediti<input name="credits" defaultValue={String(t.credits)} className="input mt-1" /></label>
      <label className="text-sm">Licenza<input name="license" defaultValue={String(t.license)} className="input mt-1" /></label>
      <label className="text-sm md:col-span-2">Attribuzione<input name="attribution" defaultValue={String(t.attribution)} className="input mt-1" /></label>
      <label className="text-sm">Colore accento<input name="accent" type="color" defaultValue={String(t.accent)} className="mt-1 h-10 w-full rounded-lg bg-transparent" /></label>
      <div className="flex items-end gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" name="featured" defaultChecked={!!t.featured} />In evidenza</label><label className="flex items-center gap-2"><input type="checkbox" name="published" defaultChecked={!!t.published} />Pubblicato</label></div>
      <fieldset className="flex flex-wrap gap-3 text-sm md:col-span-2">{genres.map((g) => <label key={g.id} className="flex items-center gap-1"><input type="checkbox" name="genres" value={g.id} defaultChecked={selected.includes(g.id)} />{g.name}</label>)}</fieldset>
      <div className="flex gap-3 md:col-span-2">
        <button className="btn btn-gold" disabled={busy}>Salva</button>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={async () => { if (confirm("Eliminare definitivamente il titolo?") && await run(A, "POST", { action: "title.delete", id: t.id })) router.push("/admin?tab=titoli"); }}>Elimina</button>
      </div>
      <Msg msg={msg} />
    </form>
  );
}

function MediaFields() {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <input name="source" required placeholder="file nella cartella sorgenti o URL" className="input md:col-span-3" />
      <input name="clipStart" type="number" step="0.1" placeholder="inizio (s)" className="input" />
      <input name="clipSeconds" type="number" step="0.1" placeholder="durata (s, 0 = tutto)" className="input" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="hdr" />Genera variante HDR10</label>
      <input name="introEnd" type="number" step="0.1" placeholder="fine intro (s)" className="input" />
      <input name="creditsStart" type="number" step="0.1" placeholder="inizio titoli di coda (s)" className="input" />
    </div>
  );
}
const mediaPayload = (f: FormData) => ({ source: f.get("source"), clipStart: Number(f.get("clipStart")) || 0, clipSeconds: Number(f.get("clipSeconds")) || 0, hdr: f.get("hdr") === "on", introStart: 0, introEnd: Number(f.get("introEnd")) || 0, creditsStart: Number(f.get("creditsStart")) || 0 });

export function AttachMedia({ titleId }: { titleId: number }) {
  const { busy, msg, run } = useAction();
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(A, "POST", { action: "title.media", titleId, ...mediaPayload(new FormData(e.currentTarget)) }, "Media in coda di elaborazione"); }}>
      <MediaFields /><button className="btn btn-ghost" disabled={busy}>Collega e codifica</button><Msg msg={msg} />
    </form>
  );
}

export function SeasonActions({ titleId }: { titleId: number }) {
  const { busy, msg, run } = useAction();
  return <div><button className="btn btn-ghost" disabled={busy} onClick={() => run(A, "POST", { action: "season.add", titleId }, "Stagione aggiunta")}>+ Stagione</button><Msg msg={msg} /></div>;
}

export function AddEpisode({ seasonId }: { seasonId: number }) {
  const { busy, msg, run } = useAction();
  const [open, setOpen] = useState(false);
  if (!open) return <button className="text-sm text-gold hover:underline" onClick={() => setOpen(true)}>+ Episodio</button>;
  return (
    <form className="mt-3 space-y-2" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); if (await run(A, "POST", { action: "episode.add", seasonId, name: f.get("name"), synopsis: f.get("synopsis"), ...mediaPayload(f) }, "Episodio aggiunto")) setOpen(false); }}>
      <input name="name" placeholder="Titolo episodio" className="input" /><input name="synopsis" placeholder="Sinossi" className="input" />
      <MediaFields /><button className="btn btn-gold" disabled={busy}>Aggiungi</button><Msg msg={msg} />
    </form>
  );
}

export function DeleteButton({ action, id, label }: { action: string; id: number; label: string }) {
  const { busy, run } = useAction();
  return <button className="text-sm text-rose hover:underline" disabled={busy} onClick={() => confirm(`${label}?`) && run(A, "POST", { action, id })}>{label}</button>;
}

export function MediaRow({ m }: { m: { id: number; status: string; progress: number; max_height: number | null; has_hdr: number; duration: number | null; error: string | null; intro_end: number | null; credits_start: number | null } }) {
  const { busy, run } = useAction();
  return (
    <span className="flex flex-wrap items-center gap-3 text-xs text-mist">
      <span>media #{m.id}</span>
      <span className={m.status === "ready" ? "text-gold" : m.status === "error" ? "text-rose" : ""}>{m.status}{m.status === "processing" ? ` ${m.progress}%` : ""}</span>
      {m.max_height && <span>{m.max_height}p{m.has_hdr ? " + HDR10" : ""}</span>}
      {m.error && <span className="text-rose" title={m.error}>errore</span>}
      <button className="text-gold hover:underline" disabled={busy} onClick={() => run(A, "POST", { action: "media.reprocess", id: m.id })}>Ricodifica</button>
    </span>
  );
}

type Job = { id: number; media_id: number; status: string; step: string | null; progress: number; updated_at: string; source: string };
export function JobsLive() {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    let stop = false;
    const load = async () => { const r = await fetch("/api/admin/jobs"); if (r.ok && !stop) setJobs((await r.json()).jobs); };
    load(); const t = setInterval(load, 3000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  return (
    <div className="card p-5" data-testid="jobs">
      <h2 className="font-serif text-xl">Coda di codifica</h2>
      <ul className="mt-3 divide-y divide-line text-sm">
        {jobs.map((j) => (
          <li key={j.id} className="py-2">
            <div className="flex justify-between gap-3"><span className="truncate">#{j.id} · media {j.media_id} · {j.source.split("/").pop()}</span><span className={j.status === "done" ? "text-gold" : j.status === "error" ? "text-rose" : ""}>{j.status}</span></div>
            {j.status === "running" && <div className="mt-1 h-1.5 overflow-hidden rounded bg-cream/10"><div className="h-full bg-gold transition-all" style={{ width: `${j.progress}%` }} /></div>}
            <p className="text-xs text-mist">{j.step}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function UploadSource() {
  const [state, setState] = useState<string>("");
  return (
    <div className="mt-3">
      <input type="file" accept="video/*,.mkv,.srt,.vtt" className="text-sm" onChange={(e) => {
        const file = e.target.files?.[0]; if (!file) return;
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", `/api/admin/upload?name=${encodeURIComponent(file.name)}`);
        xhr.upload.onprogress = (ev) => setState(`Caricamento ${Math.round((ev.loaded / ev.total) * 100)}%`);
        xhr.onload = () => { try { const j = JSON.parse(xhr.responseText); setState(xhr.status < 300 ? `Caricato come “${j.source}”: usa questo nome come sorgente.` : j.error); } catch { setState("Errore"); } };
        xhr.send(file);
      }} />
      {state && <p className="mt-2 text-sm text-gold" role="status">{state}</p>}
    </div>
  );
}

export function UserRow({ u, plans }: { u: { id: number; email: string; name: string; role: string; created_at: string; plan: string | null }; plans: { id: string; name: string }[] }) {
  const { busy, run } = useAction();
  return (
    <tr className="bg-plum/40">
      <td className="p-3">{u.name}<span className="block text-xs text-mist">{u.email}</span></td>
      <td><select aria-label="Ruolo" disabled={busy} defaultValue={u.role} className="input !w-auto !py-1" onChange={(e) => run(A, "POST", { action: "user.role", id: u.id, role: e.target.value })}><option value="user">utente</option><option value="admin">admin</option></select></td>
      <td><select aria-label="Piano" disabled={busy} defaultValue={u.plan || ""} className="input !w-auto !py-1" onChange={(e) => run(A, "POST", { action: "user.plan", id: u.id, planId: e.target.value || null })}><option value="">nessuno</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
      <td className="text-xs text-mist">{new Date(u.created_at + "Z").toLocaleDateString("it-IT")}</td>
    </tr>
  );
}

export function PlanEditor({ p }: { p: { id: string; name: string; description: string; price_cents: number; max_height: number; hdr: number; screens: number; active: number } }) {
  const { busy, msg, run } = useAction();
  return (
    <form className="card space-y-2 p-5" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(A, "POST", { action: "plan.save", id: p.id, name: f.get("name"), description: f.get("description"), priceCents: Math.round(Number(f.get("price")) * 100), maxHeight: Number(f.get("maxHeight")), hdr: f.get("hdr") === "on", screens: Number(f.get("screens")), active: f.get("active") === "on" }, "Piano salvato"); }}>
      <p className="text-xs uppercase tracking-widest text-gold">{p.id}</p>
      <input name="name" defaultValue={p.name} className="input" aria-label="Nome" />
      <input name="description" defaultValue={p.description} className="input" aria-label="Descrizione" />
      <label className="block text-sm">Prezzo mensile (€)<input name="price" type="number" step="0.01" defaultValue={(p.price_cents / 100).toFixed(2)} className="input mt-1" /></label>
      <label className="block text-sm">Qualità massima<select name="maxHeight" defaultValue={p.max_height} className="input mt-1"><option value={720}>720p</option><option value={1080}>1080p</option><option value={2160}>2160p (4K)</option></select></label>
      <label className="block text-sm">Schermi<input name="screens" type="number" min={1} max={10} defaultValue={p.screens} className="input mt-1" /></label>
      <div className="flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" name="hdr" defaultChecked={!!p.hdr} />HDR</label><label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={!!p.active} />Attivo</label></div>
      <button className="btn btn-gold" disabled={busy}>Salva</button><Msg msg={msg} />
    </form>
  );
}
