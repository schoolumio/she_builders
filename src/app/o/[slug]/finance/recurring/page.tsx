import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InlineAction } from "@/components/ui/inline-action";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { INTERVAL_LABEL, listRecurringForOrganisation } from "@/server/payments/recurring";
import { can } from "@/server/tenancy/context";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/time";
import { cancelRecurringOrgAction } from "../actions";

export const metadata = { title: "Recurring gifts" };

export default async function RecurringGiftsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug, "finance.view");
  const user = (await getCurrentUser())!;
  const rows = await listRecurringForOrganisation(ctx);
  const active = rows.filter((r) => r.status === "ACTIVE" || r.status === "PAST_DUE");
  const monthly = new Map<string, number>();
  for (const r of active) monthly.set(r.currency, (monthly.get(r.currency) ?? 0) + (r.interval === "WEEKLY" ? Math.round((r.amount * 52) / 12) : r.amount));
  return (
    <>
      <PageHeader
        title="Recurring gifts"
        description={`${active.length} active.${[...monthly.entries()].map(([c, v]) => ` About ${formatMoney(v, c)} per month.`).join("")} Each payment appears under Donations once the provider confirms it.`}
      />
      {rows.length === 0 ? <EmptyState title="No recurring gifts yet">Turn on &ldquo;Offer weekly and monthly recurring gifts&rdquo; on a campaign to accept them.</EmptyState> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-canvas text-left text-muted"><tr><th className="px-4 py-2 font-medium">Donor</th><th className="px-4 py-2 font-medium">Campaign</th><th className="px-4 py-2 font-medium">Amount</th><th className="px-4 py-2 font-medium">Payments</th><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-2">{r.anonymous ? "Anonymous" : (r.donorName ?? "—")}<span className="block text-xs text-muted">since {formatInZone(r.createdAt, user.timezone, "d LLL yyyy")}</span></td>
                  <td className="px-4 py-2">{r.campaign.title}</td>
                  <td className="px-4 py-2">{formatMoney(r.amount, r.currency)} {INTERVAL_LABEL[r.interval]}</td>
                  <td className="px-4 py-2">{r.chargesCount}{r.lastChargeAt && <span className="block text-xs text-muted">last {formatInZone(r.lastChargeAt, user.timezone, "d LLL")}</span>}</td>
                  <td className="px-4 py-2"><Badge tone={r.status === "ACTIVE" ? "success" : r.status === "PAST_DUE" ? "danger" : "neutral"}>{r.status === "PAST_DUE" ? "payment failed" : r.status.toLowerCase()}</Badge></td>
                  <td className="px-4 py-2">{can(ctx, "finance.manage") && (r.status === "ACTIVE" || r.status === "PAST_DUE") && <InlineAction action={cancelRecurringOrgAction.bind(null, slug)} fields={{ id: r.id }} variant="ghost" confirm="Cancel this donor's recurring gift? They will be notified by the provider.">Cancel</InlineAction>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
