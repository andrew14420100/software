"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";

export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (url: string, method: string, data: unknown, ok = "Fatto") => {
    setBusy(true); setMsg(null);
    try { await api(url, method, data); setMsg({ ok: true, text: ok }); router.refresh(); return true; }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); return false; }
    finally { setBusy(false); }
  };
  return { busy, msg, run };
}

export function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-gold" : "text-[#ffb3c8]"}`}>{msg.text}</p>;
}

export function PlanButton({ planId, label, primary }: { planId: string; label: string; primary?: boolean }) {
  const { busy, msg, run } = useAction();
  const router = useRouter();
  return (
    <div>
      <button className={`btn mt-6 w-full ${primary ? "btn-gold" : "btn-ghost"}`} disabled={busy} data-testid={`plan-${planId}`}
        onClick={async () => { if (await run("/api/subscription", "POST", { action: "subscribe", planId }, "Abbonamento attivato")) router.push("/account"); }}>
        {busy ? "Pagamento in corso…" : label}
      </button>
      <Msg msg={msg} />
    </div>
  );
}

export function SubscriptionControls({ status }: { status: string }) {
  const { busy, msg, run } = useAction();
  return (
    <div>
      {status === "active"
        ? <button className="btn btn-danger" disabled={busy} onClick={() => run("/api/subscription", "POST", { action: "cancel" }, "Rinnovo disattivato: resterai abbonato fino alla scadenza")}>Annulla rinnovo</button>
        : <button className="btn btn-gold" disabled={busy} onClick={() => run("/api/subscription", "POST", { action: "resume" }, "Rinnovo riattivato")}>Riattiva rinnovo</button>}
      <Msg msg={msg} />
    </div>
  );
}

export function ProfileForm({ name, autoplay }: { name: string; autoplay: boolean }) {
  const { busy, msg, run } = useAction();
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("/api/account", "POST", { action: "profile", name: f.get("name"), autoplayNext: f.get("autoplay") === "on" }, "Profilo aggiornato"); }}>
      <label className="block text-sm">Nome<input name="name" defaultValue={name} className="input mt-1" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="autoplay" defaultChecked={autoplay} className="h-4 w-4 accent-[var(--color-gold)]" />Riproduci automaticamente l&apos;episodio successivo</label>
      <button className="btn btn-ghost" disabled={busy}>Salva</button><Msg msg={msg} />
    </form>
  );
}

export function PasswordForm() {
  const { busy, msg, run } = useAction();
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); if (await run("/api/account", "POST", { action: "password", current: f.get("current"), password: f.get("password") }, "Password aggiornata; gli altri dispositivi sono stati disconnessi")) form.reset(); }}>
      <label className="block text-sm">Password attuale<input name="current" type="password" autoComplete="current-password" className="input mt-1" /></label>
      <label className="block text-sm">Nuova password<input name="password" type="password" minLength={8} autoComplete="new-password" className="input mt-1" /></label>
      <button className="btn btn-ghost" disabled={busy}>Cambia password</button><Msg msg={msg} />
    </form>
  );
}

export function RevokeButton({ id }: { id: string }) {
  const { busy, run } = useAction();
  return <button className="text-sm text-rose hover:underline" disabled={busy} onClick={() => run("/api/account", "POST", { action: "revoke-session", sessionId: id })}>Disconnetti</button>;
}

export function HistoryRemove({ mediaId }: { mediaId?: number }) {
  const { busy, run } = useAction();
  return mediaId
    ? <button className="text-sm text-mist hover:text-rose" disabled={busy} onClick={() => run("/api/history", "DELETE", { mediaId })} aria-label="Rimuovi dalla cronologia">Rimuovi</button>
    : <button className="btn btn-danger" disabled={busy} onClick={() => confirm("Cancellare tutta la cronologia?") && run("/api/history", "DELETE", {})}>Cancella cronologia</button>;
}
