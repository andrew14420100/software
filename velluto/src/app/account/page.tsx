import Link from "next/link";
import { cookies } from "next/headers";
import { PasswordForm, ProfileForm, RevokeButton, SubscriptionControls } from "@/components/AccountActions";
import { euro } from "@/components/api";
import { SESSION_COOKIE, currentSessionId, listSessions } from "@/server/auth.ts";
import { requireUserPage } from "@/server/session.ts";
import { activeSubscription, listPayments } from "@/server/subscriptions.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account" };

const device = (ua: string) => (/iPhone|Android.*Mobile/.test(ua) ? "Smartphone" : /iPad|Tablet|Android/.test(ua) ? "Tablet" : "Computer") + (/Firefox/.test(ua) ? " · Firefox" : /Edg/.test(ua) ? " · Edge" : /Chrome/.test(ua) ? " · Chrome" : /Safari/.test(ua) ? " · Safari" : "");

export default async function Account() {
  const user = await requireUserPage("/account");
  const sub = activeSubscription(user.id);
  const me = currentSessionId((await cookies()).get(SESSION_COOKIE)!.value);
  return (
    <div className="mx-auto grid max-w-5xl gap-5 px-5 py-10 md:grid-cols-2 md:px-10">
      <h1 className="font-serif text-4xl md:col-span-2">Il tuo account</h1>
      <section className="card p-6 md:col-span-2" data-testid="subscription">
        <h2 className="font-serif text-2xl">Abbonamento</h2>
        {sub ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg">Piano <b>{sub.plan.name}</b> · {euro(sub.plan.price_cents)}/mese</p>
              <p className="text-sm text-mist">{sub.plan.description}. {sub.status === "active" ? "Si rinnova il" : "Termina il"} {new Date(sub.current_period_end + "Z").toLocaleDateString("it-IT")}.</p>
            </div>
            <div className="flex gap-3"><Link href="/abbonamenti" className="btn btn-ghost">Cambia piano</Link><SubscriptionControls status={sub.status} /></div>
          </div>
        ) : <div className="mt-3 flex items-center justify-between gap-4"><p className="text-mist">Nessun abbonamento attivo.</p><Link href="/abbonamenti" className="btn btn-gold">Scegli un piano</Link></div>}
      </section>
      <section className="card p-6"><h2 className="mb-3 font-serif text-2xl">Profilo</h2><p className="mb-3 text-sm text-mist">{user.email}</p><ProfileForm name={user.name} autoplay={!!user.autoplay_next} /></section>
      <section className="card p-6"><h2 className="mb-3 font-serif text-2xl">Sicurezza</h2><PasswordForm /></section>
      <section className="card p-6">
        <h2 className="mb-3 font-serif text-2xl">Dispositivi connessi</h2>
        <ul className="divide-y divide-line text-sm">
          {listSessions(user.id).map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <span>{device(s.user_agent || "")}<span className="block text-xs text-mist">ultimo accesso {new Date(s.last_seen + "Z").toLocaleString("it-IT")}</span></span>
              {s.id === me ? <span className="text-xs text-gold">questo dispositivo</span> : <RevokeButton id={s.id} />}
            </li>
          ))}
        </ul>
      </section>
      <section className="card p-6">
        <h2 className="mb-3 font-serif text-2xl">Pagamenti</h2>
        <ul className="divide-y divide-line text-sm">
          {listPayments(user.id).map((p) => (
            <li key={p.id} className="flex justify-between py-2"><span>{new Date(p.created_at + "Z").toLocaleDateString("it-IT")} · {p.plan_id}</span><span>{euro(p.amount_cents)} <span className="text-xs text-mist">({p.provider})</span></span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
