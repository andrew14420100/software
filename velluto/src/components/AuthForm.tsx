"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "./api";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const next = sp.get("next");
  const plan = sp.get("plan");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr(""); setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", "POST", f);
      router.push(mode === "register" ? `/abbonamenti${plan ? `?plan=${plan}` : ""}` : safeNext || "/");
      router.refresh();
    } catch (x) { setErr((x as Error).message); setBusy(false); }
  }

  return (
    <div className="mx-auto grid min-h-[75vh] max-w-md place-items-center px-5 py-10">
      <form onSubmit={submit} className="card w-full space-y-4 p-7 animate-fade-up" noValidate>
        <h1 className="font-serif text-3xl">{mode === "login" ? "Bentornato" : "Crea il tuo account"}</h1>
        {mode === "register" && <label className="block text-sm">Nome<input name="name" autoComplete="name" className="input mt-1" /></label>}
        <label className="block text-sm">Email<input name="email" type="email" required autoComplete="email" className="input mt-1" /></label>
        <label className="block text-sm">Password<input name="password" type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} className="input mt-1" /></label>
        {err && <p role="alert" className="rounded-lg bg-rose/15 px-3 py-2 text-sm text-[#ffb3c8]">{err}</p>}
        <button className="btn btn-gold w-full" disabled={busy}>{busy ? "Attendere…" : mode === "login" ? "Accedi" : "Registrati"}</button>
        <p className="text-center text-sm text-mist">
          {mode === "login" ? <>Non hai un account? <Link className="text-gold hover:underline" href="/registrati">Registrati</Link></> : <>Hai già un account? <Link className="text-gold hover:underline" href="/accedi">Accedi</Link></>}
        </p>
      </form>
    </div>
  );
}
