import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { listPlans } from "@/server/billing/service";
import { FEATURES, type FeatureKey, type LimitKey } from "@/server/billing/catalog";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

const HIGHLIGHT = "MINISTRY";
const LIMIT_LABEL: Partial<Record<LimitKey, [string, string]>> = {
  "limit.members": ["member", "members"],
  "limit.admins": ["administrator", "administrators"],
  "limit.groups": ["group", "groups"],
  "limit.room_participants": ["person per live room", "people per live room"],
};

export default async function PricingPage() {
  const plans = await listPlans();
  const tiers = plans.filter((p) => p.monthlyPrice !== null);
  const enterprise = plans.find((p) => p.monthlyPrice === null);
  const featuresOf = (p: (typeof plans)[number]) => new Set(p.entitlements.filter((e) => e.enabled && e.key in FEATURES).map((e) => e.key as FeatureKey));

  return (
    <>
      <section className="relative overflow-hidden bg-plum-900 text-white">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(50rem_30rem_at_80%_-20%,rgba(197,161,74,0.2),transparent_60%)]" />
        <div className="relative mx-auto max-w-7xl px-5 pb-40 pt-20 text-center sm:px-8">
          <p className="eyebrow text-gold-400">Pricing</p>
          <h1 className="mx-auto mt-5 max-w-3xl font-serif text-4xl font-medium leading-tight sm:text-6xl">Plans that grow with your ministry.</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/70">
            Subscriptions pay for the software. Donations are always separate and settle to your ministry&apos;s own payment account.
          </p>
        </div>
      </section>

      <section className="bg-canvas">
        <div className="mx-auto -mt-28 max-w-7xl px-5 pb-20 sm:px-8">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {tiers.map((p, i) => {
              const ent = new Map(p.entitlements.map((e) => [e.key, e]));
              const prev = tiers[i - 1];
              const prevFeatures = prev ? featuresOf(prev) : new Set<FeatureKey>();
              const added = [...featuresOf(p)].filter((k) => !prevFeatures.has(k));
              const featured = p.code === HIGHLIGHT;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "relative flex flex-col rounded-2xl border p-7",
                    featured ? "border-plum-700 bg-plum-950 text-white shadow-[var(--shadow-lift)] ring-1 ring-gold-500/40" : "border-line bg-surface shadow-[var(--shadow-card)]",
                  )}
                >
                  {featured && <span className="absolute -top-3 left-7 rounded-full bg-gold-500 px-3 py-1 text-xs font-semibold text-plum-950">Recommended for churches</span>}
                  <h2 className={cn("font-serif text-2xl font-medium", featured ? "text-white" : "text-plum-900")}>{p.name}</h2>
                  <p className={cn("mt-2 min-h-12 text-sm leading-6", featured ? "text-white/65" : "text-muted")}>{p.description}</p>
                  <p className="mt-6 flex items-baseline gap-1.5">
                    <span className={cn("font-serif text-4xl font-medium", featured ? "text-white" : "text-plum-900")}>{p.monthlyPrice === 0 ? "Free" : formatMoney(p.monthlyPrice!, p.currency)}</span>
                    {!!p.monthlyPrice && <span className={featured ? "text-white/60" : "text-muted"}>/ month</span>}
                  </p>
                  <p className={cn("mt-1 h-5 text-xs", featured ? "text-gold-400" : "text-gold-600")}>{p.trialDays > 0 ? `${p.trialDays}-day free trial` : ""}</p>
                  <Link
                    href="/register?next=/orgs/new"
                    className={cn(
                      "mt-6 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition",
                      featured ? "bg-gold-500 text-plum-950 hover:bg-gold-400" : "border border-line bg-surface text-plum-900 hover:border-plum-700/40",
                    )}
                  >
                    {p.monthlyPrice === 0 ? "Start free" : `Start with ${p.name}`}
                  </Link>
                  <ul className={cn("mt-7 space-y-2.5 border-t pt-6 text-sm", featured ? "border-white/10 text-white/80" : "border-line text-ink/80")}>
                    {(Object.keys(LIMIT_LABEL) as LimitKey[]).map((k) => {
                      const e = ent.get(k);
                      const limit = e?.enabled ? e.limit : 0;
                      if (limit === 0) return null;
                      return (
                        <li key={k}>
                          <span className={cn("font-semibold", featured ? "text-white" : "text-plum-900")}>{limit === null ? "Unlimited" : limit.toLocaleString("en")}</span> {LIMIT_LABEL[k]![limit === 1 ? 0 : 1]}
                        </li>
                      );
                    })}
                  </ul>
                  <ul className={cn("mt-5 space-y-2.5 text-sm", featured ? "text-white/80" : "text-ink/80")}>
                    {prev && <li className={cn("text-xs font-semibold uppercase tracking-[0.12em]", featured ? "text-white/50" : "text-muted")}>Everything in {prev.name}, plus</li>}
                    {added.map((k) => (
                      <li key={k} className="flex gap-2">
                        <Check className={cn("mt-0.5 size-4 shrink-0", featured ? "text-gold-400" : "text-plum-700")} aria-hidden />
                        {FEATURES[k]}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {enterprise && (
            <div className="mt-8 flex flex-col gap-6 rounded-2xl border border-line bg-surface p-8 shadow-[var(--shadow-card)] lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="eyebrow text-gold-600">{enterprise.name}</p>
                <h2 className="mt-2 font-serif text-3xl font-medium text-plum-900">For large congregations and ministry networks</h2>
                <p className="mt-3 leading-7 text-muted">
                  Unlimited members, administrators and groups, larger live rooms, custom onboarding, and agreed security, data-protection and support arrangements.
                </p>
              </div>
              <Link href="/support?topic=demo" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-plum-900 px-7 py-4 font-semibold text-white transition hover:bg-plum-800">
                Talk to us <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          )}

          <div className="mt-12 grid gap-6 text-sm leading-6 text-muted md:grid-cols-3">
            <p><span className="font-semibold text-plum-900">No fee on donations by default.</span> If a plan ever includes a platform fee, donors see it before they pay and it is recorded separately.</p>
            <p><span className="font-semibold text-plum-900">Indicative prices.</span> Prices shown are indicative and may change before general availability; your agreed price is confirmed in writing.</p>
            <p><span className="font-semibold text-plum-900">Cancel any time.</span> Cancellation takes effect at the end of the billing period. Your content is kept if you move to a smaller plan.</p>
          </div>
        </div>
      </section>
    </>
  );
}
