import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { DonationStatusBadge } from "@/components/donation-status";
import { requireUser } from "@/server/auth/current-user";
import { listMyDonations } from "@/server/payments/donations";
import { INTERVAL_LABEL, listMyRecurringDonations } from "@/server/payments/recurring";
import { Badge } from "@/components/ui/badge";
import { InlineAction } from "@/components/ui/inline-action";
import { cancelRecurringAction } from "../../c/[slug]/actions";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/time";

export const metadata = { title: "My giving" };

export default async function MyDonationsPage() {
  const user = await requireUser("/app/donations");
  const [rows, recurring] = await Promise.all([listMyDonations(user.id), listMyRecurringDonations(user.id)]);
  return (
    <>
      <PageHeader title="My giving" description="Donations and paid gifts you made while signed in, with their provider-confirmed status." />
      {recurring.length > 0 && (
        <section aria-labelledby="recurring-h" className="mb-8">
          <h2 id="recurring-h" className="mb-3 font-semibold text-plum-900">Recurring gifts</h2>
          <div className="space-y-3">
            {recurring.map((r) => (
              <Card key={r.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{formatMoney(r.amount, r.currency)} {INTERVAL_LABEL[r.interval]} to {r.organization.name}</p>
                  <p className="text-sm text-muted">{r.campaign.title} · {r.chargesCount} payment{r.chargesCount === 1 ? "" : "s"} made{r.nextChargeAt && r.status !== "CANCELED" ? ` · next around ${formatInZone(r.nextChargeAt, user.timezone, "d LLL")}` : ""}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={r.status === "ACTIVE" ? "success" : r.status === "PAST_DUE" ? "danger" : "neutral"}>{r.status === "PAST_DUE" ? "payment failed" : r.status.toLowerCase()}</Badge>
                  <Link href={`/donations/recurring/${r.reference}`} className="text-sm text-plum-700 underline">Details</Link>
                  {(r.status === "ACTIVE" || r.status === "PAST_DUE") && <InlineAction action={cancelRecurringAction} fields={{ id: r.id }} variant="danger" confirm="Cancel this recurring gift?">Cancel</InlineAction>}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
      {rows.length === 0 ? (
        <EmptyState title="No donations yet" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-canvas text-left text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t border-line">
                  <td className="px-4 py-3">{formatInZone(d.createdAt, user.timezone, "d LLL yyyy")}</td>
                  <td className="px-4 py-3">
                    {d.organization.name}
                    {d.campaign && <span className="block text-xs text-muted">{d.campaign.title}</span>}
                    {d.purpose === "GIFT" && <span className="block text-xs text-muted">Virtual gift</span>}
                  </td>
                  <td className="px-4 py-3">{formatMoney(d.amount, d.currency)}</td>
                  <td className="px-4 py-3"><DonationStatusBadge status={d.status} /></td>
                  <td className="px-4 py-3">
                    <Link href={`/donations/${d.reference}`} className="text-plum-700 underline">
                      {d.receiptNumber ?? "View"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
