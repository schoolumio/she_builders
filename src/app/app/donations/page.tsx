import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { DonationStatusBadge } from "@/components/donation-status";
import { requireUser } from "@/server/auth/current-user";
import { listMyDonations } from "@/server/payments/donations";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/time";

export const metadata = { title: "My giving" };

export default async function MyDonationsPage() {
  const user = await requireUser("/app/donations");
  const rows = await listMyDonations(user.id);
  return (
    <>
      <PageHeader title="My giving" description="Donations and paid gifts you made while signed in, with their provider-confirmed status." />
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
