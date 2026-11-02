import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listPlans } from "@/server/billing/service";
import { FEATURES, LIMITS } from "@/server/billing/catalog";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const plans = await listPlans();
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h1 className="font-serif text-3xl font-semibold text-plum-900 sm:text-4xl">Plans</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Subscriptions pay for the software. Donations to your community are separate and settle to your own payment account. Prices shown are indicative and may change before general availability.
      </p>
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {plans.map((p) => {
          const ent = new Map(p.entitlements.map((e) => [e.key, e]));
          return (
            <Card key={p.id} className="flex flex-col">
              <h2 className="font-semibold text-plum-900">{p.name}</h2>
              <p className="mt-1 min-h-10 text-xs text-muted">{p.description}</p>
              <p className="mt-4 text-2xl font-semibold text-plum-900">
                {p.monthlyPrice === null ? "Custom" : p.monthlyPrice === 0 ? "Free" : formatMoney(p.monthlyPrice, p.currency)}
                {p.monthlyPrice ? <span className="text-sm font-normal text-muted"> /month</span> : null}
              </p>
              {p.trialDays > 0 && <Badge tone="gold" className="mt-2 self-start">{p.trialDays}-day trial</Badge>}
              <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                {(Object.keys(LIMITS) as (keyof typeof LIMITS)[]).map((k) => {
                  const e = ent.get(k);
                  const limit = e?.enabled ? e.limit : 0;
                  return (
                    <li key={k} className="text-muted">
                      <span className="font-medium text-ink">{limit === null ? "Unlimited" : limit}</span> {LIMITS[k].toLowerCase()}
                    </li>
                  );
                })}
                {(Object.keys(FEATURES) as (keyof typeof FEATURES)[])
                  .filter((k) => ent.get(k)?.enabled)
                  .map((k) => (
                    <li key={k}>✓ {FEATURES[k]}</li>
                  ))}
              </ul>
              <LinkButton href={p.monthlyPrice === null ? "/support" : "/register?next=/orgs/new"} variant={p.code === "GROWTH" ? "primary" : "secondary"} className="mt-6">
                {p.monthlyPrice === null ? "Contact us" : "Get started"}
              </LinkButton>
            </Card>
          );
        })}
      </div>
      <p className="mt-8 text-sm text-muted">
        A platform fee on donations is not charged by default. If one is ever introduced for a plan, it will be shown to donors before they pay and kept in separate records.
      </p>
    </div>
  );
}
