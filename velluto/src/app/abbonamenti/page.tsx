import { Check } from "lucide-react";
import { PlanButton } from "@/components/AccountActions";
import { euro } from "@/components/api";
import { requireUserPage } from "@/server/session.ts";
import { activeSubscription, listPlans } from "@/server/subscriptions.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Abbonamenti" };

export default async function Plans({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const user = await requireUserPage("/abbonamenti");
  const sub = activeSubscription(user.id);
  const pre = (await searchParams).plan;
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:px-10">
      <h1 className="font-serif text-4xl">Scegli il piano</h1>
      <p className="mt-2 text-mist">Puoi cambiare o annullare quando vuoi. {sub && <>Piano attuale: <b className="text-cream">{sub.plan.name}</b>.</>}</p>
      <p className="mt-2 rounded-lg bg-gold/10 px-3 py-2 text-sm text-gold">Ambiente dimostrativo: il pagamento è simulato, nessun dato di pagamento viene richiesto o addebitato.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {listPlans().map((p) => (
          <div key={p.id} className={`card p-6 ${pre === p.id || p.hdr ? "ring-1 ring-gold" : ""}`}>
            <p className="text-sm uppercase tracking-widest text-gold">{p.name}</p>
            <p className="mt-2 font-serif text-4xl">{euro(p.price_cents)}<span className="text-base text-mist"> /mese</span></p>
            <p className="mt-1 text-sm text-mist">{p.description}</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex gap-2"><Check className="h-4 w-4 text-gold" />Qualità fino a {p.max_height >= 2160 ? "4K (2160p)" : `${p.max_height}p`}</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-gold" />{p.screens} {p.screens > 1 ? "schermi" : "schermo"} contemporanei</li>
              <li className="flex gap-2"><Check className={`h-4 w-4 ${p.hdr ? "text-gold" : "text-line"}`} />{p.hdr ? "HDR10 sui display compatibili" : "Senza HDR"}</li>
            </ul>
            {sub?.plan_id === p.id && sub.status === "active" ? <p className="btn btn-ghost mt-6 w-full">Piano attuale</p> : <PlanButton planId={p.id} primary={!!p.hdr || pre === p.id} label={sub ? `Passa a ${p.name}` : `Abbonati a ${p.name}`} />}
          </div>
        ))}
      </div>
    </div>
  );
}
