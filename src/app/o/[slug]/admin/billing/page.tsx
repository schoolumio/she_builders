import { Card, CardTitle, Notice, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { pageOrgContext } from "@/server/page";
import { getBillingOverview } from "@/server/billing/service";
import { FEATURES, LIMITS, type LimitKey } from "@/server/billing/catalog";
import { limitOf } from "@/server/billing/entitlements";
import { can } from "@/server/tenancy/context";
import { getCurrentUser } from "@/server/auth/current-user";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/time";
import { billingPortalAction, cancelSubscriptionAction, subscribeAction } from "../actions";

export const metadata = { title: "Plan & billing" };

export default async function BillingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const { slug } = await params;
  const { checkout } = await searchParams;
  const ctx = await pageOrgContext(slug, "billing.view");
  const user = (await getCurrentUser())!;
  const o = await getBillingOverview(ctx);
  const ent = o.entitlements;
  const sub = ent.subscription;
  const manage = can(ctx, "billing.manage");
  return (
    <>
      <PageHeader title="Plan & billing" description="Your subscription to the platform. This is separate from donations your community receives." />
      {checkout === "success" && <Notice tone="success" className="mb-4">Thank you. Your subscription will update as soon as the payment provider confirms it.</Notice>}
      {o.provider === "none" && <Notice tone="warning" className="mb-4" title="Online billing is not configured yet">To change plans, contact us through the support page. Platform administrators apply plan changes manually until online billing is enabled.</Notice>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Current plan</CardTitle>
          <p className="mt-2 font-serif text-2xl font-semibold text-plum-900">{ent.plan.name}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sub && <Badge tone={sub.status === "ACTIVE" || sub.status === "TRIALING" ? "success" : "warning"}>{sub.status.toLowerCase().replace("_", " ")}</Badge>}
            {sub?.cancelAtPeriodEnd && <Badge tone="warning">Ends at period close</Badge>}
            {ent.degraded && <Badge tone="danger">Lapsed — using Free limits</Badge>}
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            {sub?.trialEndsAt && <div><dt className="inline text-muted">Trial ends: </dt><dd className="inline">{formatInZone(sub.trialEndsAt, user.timezone, "d LLL yyyy")}</dd></div>}
            {sub?.currentPeriodEnd && <div><dt className="inline text-muted">Current period ends: </dt><dd className="inline">{formatInZone(sub.currentPeriodEnd, user.timezone, "d LLL yyyy")}</dd></div>}
            {sub?.graceEndsAt && <div><dt className="inline text-muted">Grace period ends: </dt><dd className="inline">{formatInZone(sub.graceEndsAt, user.timezone, "d LLL yyyy")}</dd></div>}
          </dl>
          {manage && sub && ent.plan.code !== "FREE" && (
            <div className="mt-4 flex flex-wrap gap-2">
              {sub.providerCustomerId && <ActionForm action={billingPortalAction.bind(null, slug)} className="space-y-0"><SubmitButton variant="secondary" size="sm">Manage payment method & invoices</SubmitButton></ActionForm>}
              <ActionForm action={cancelSubscriptionAction.bind(null, slug)} className="space-y-0">
                <input type="hidden" name="cancel" value={sub.cancelAtPeriodEnd ? "0" : "1"} />
                <SubmitButton variant="ghost" size="sm">{sub.cancelAtPeriodEnd ? "Keep my subscription" : "Cancel at period end"}</SubmitButton>
              </ActionForm>
            </div>
          )}
        </Card>
        <Card>
          <CardTitle>Usage</CardTitle>
          <ul className="mt-3 space-y-2 text-sm">
            {(Object.keys(o.usage) as LimitKey[]).map((k) => {
              const limit = limitOf(ent, k);
              const used = o.usage[k as keyof typeof o.usage];
              return (
                <li key={k}>
                  <div className="flex justify-between"><span>{LIMITS[k]}</span><span className="text-muted">{used} / {limit === null ? "∞" : limit}</span></div>
                  {limit !== null && limit > 0 && <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-violet-100"><div className="h-full bg-plum-700" style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></div>}
                </li>
              );
            })}
          </ul>
          {o.meetingMinutes.length > 0 && <p className="mt-3 text-xs text-muted">In-app participant minutes this month: {o.meetingMinutes.find((u) => u.metric === "meeting.participant_minutes" && u.period === new Date().toISOString().slice(0, 7))?.quantity ?? 0}</p>}
        </Card>
      </div>
      <h2 className="mb-3 mt-8 font-semibold text-plum-900">Plans</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {o.plans.filter((p) => p.code !== "FREE").map((p) => {
          const e = new Map(p.entitlements.map((x) => [x.key, x]));
          const current = p.code === ent.plan.code;
          return (
            <Card key={p.id} className={current ? "border-plum-700" : ""}>
              <p className="font-semibold">{p.name}</p>
              <p className="mt-1 text-lg font-semibold">{p.monthlyPrice === null ? "Custom" : `${formatMoney(p.monthlyPrice, p.currency)}/mo`}</p>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {(Object.keys(FEATURES) as (keyof typeof FEATURES)[]).filter((k) => e.get(k)?.enabled).map((k) => <li key={k}>✓ {FEATURES[k]}</li>)}
              </ul>
              {manage && !current && p.monthlyPrice !== null && o.provider === "stripe" && (
                <ActionForm action={subscribeAction.bind(null, slug)} className="mt-3 space-y-2">
                  <input type="hidden" name="plan" value={p.code} />
                  <select name="interval" className="w-full rounded-lg border border-line px-2 py-1.5 text-sm" aria-label="Billing interval"><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select>
                  <SubmitButton size="sm" className="w-full">Choose {p.name}</SubmitButton>
                </ActionForm>
              )}
              {current && <Badge tone="success" className="mt-3">Current plan</Badge>}
            </Card>
          );
        })}
      </div>
      <h2 className="mb-3 mt-8 font-semibold text-plum-900">Billing history</h2>
      <Card className="overflow-x-auto p-0">
        {o.invoices.length === 0 ? <p className="p-5 text-sm text-muted">No invoices yet.</p> : (
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-canvas text-left text-muted"><tr><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Plan</th><th className="px-4 py-2 font-medium">Amount</th><th className="px-4 py-2 font-medium">Status</th></tr></thead>
            <tbody>
              {o.invoices.map((i) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="px-4 py-2">{formatInZone(i.createdAt, user.timezone, "d LLL yyyy")}</td>
                  <td className="px-4 py-2">{i.planCode}</td>
                  <td className="px-4 py-2">{formatMoney(i.amount, i.currency)}</td>
                  <td className="px-4 py-2">{i.hostedUrl ? <a href={i.hostedUrl} className="underline" target="_blank" rel="noopener noreferrer">{i.status.toLowerCase()}</a> : i.status.toLowerCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
