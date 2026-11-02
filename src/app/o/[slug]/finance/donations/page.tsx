import Link from "next/link";
import type { DonationStatus } from "@prisma/client";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { DonationStatusBadge } from "@/components/donation-status";
import { pageOrgContext } from "@/server/page";
import { listDonations } from "@/server/payments/donations";
import { getCurrentUser } from "@/server/auth/current-user";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/time";

export const metadata = { title: "Donations" };

const STATUSES: DonationStatus[] = ["SUCCEEDED", "PENDING", "FAILED", "PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED", "ABANDONED"];

export default async function DonationsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ status?: string; purpose?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await pageOrgContext(slug, "finance.view");
  const user = (await getCurrentUser())!;
  const status = STATUSES.find((s) => s === sp.status);
  const purpose = sp.purpose === "GIFT" ? "GIFT" : "DONATION";
  const rows = await listDonations(ctx, { status, purpose });
  return (
    <>
      <PageHeader title={purpose === "GIFT" ? "Paid gifts" : "Donations"} actions={<a href={`/api/orgs/${slug}/finance/export`} className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-violet-50">Export CSV</a>} />
      <form className="mb-4 flex flex-wrap gap-2">
        <label className="text-sm"><span className="sr-only">Status</span>
          <select name="status" defaultValue={status ?? ""} className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase().replace("_", " ")}</option>)}
          </select>
        </label>
        <label className="text-sm"><span className="sr-only">Type</span>
          <select name="purpose" defaultValue={purpose} className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm">
            <option value="DONATION">Donations</option>
            <option value="GIFT">Paid gifts (not donations)</option>
          </select>
        </label>
        <button className="rounded-lg border border-line bg-surface px-3 text-sm">Filter</button>
      </form>
      {rows.length === 0 ? <EmptyState title="Nothing to show" /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-canvas text-left text-muted"><tr><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Donor</th><th className="px-4 py-2 font-medium">Campaign</th><th className="px-4 py-2 font-medium">Amount</th><th className="px-4 py-2 font-medium">Net</th><th className="px-4 py-2 font-medium">Status</th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t border-line">
                  <td className="px-4 py-2"><Link href={`/o/${slug}/finance/donations/${d.id}`} className="underline">{formatInZone(d.createdAt, user.timezone, "d LLL yyyy HH:mm")}</Link></td>
                  <td className="px-4 py-2">{d.anonymous ? "Anonymous" : (d.donorName ?? "Guest")}</td>
                  <td className="px-4 py-2">{d.campaign?.title ?? "—"}</td>
                  <td className="px-4 py-2">{formatMoney(d.amount, d.currency)}</td>
                  <td className="px-4 py-2">{formatMoney(d.netAmount, d.currency)}</td>
                  <td className="px-4 py-2"><DonationStatusBadge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
