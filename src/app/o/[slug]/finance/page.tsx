import Link from "next/link";
import { Card, CardTitle, Notice, PageHeader, Stat } from "@/components/ui/card";
import { DonationStatusBadge } from "@/components/donation-status";
import { pageOrgContext } from "@/server/page";
import { financeSummary, listDonations } from "@/server/payments/donations";
import { activeConnection, donationReadiness } from "@/server/payments/connections";
import { CONNECTION_STATUS_COPY } from "@/server/payments/status";
import { getCurrentUser } from "@/server/auth/current-user";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/time";

export const metadata = { title: "Finance" };

export default async function FinanceOverview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug, "finance.view");
  const user = (await getCurrentUser())!;
  const [summary, recent, conn, ready] = await Promise.all([financeSummary(ctx), listDonations(ctx, { take: 8 }), activeConnection(ctx.org.id), donationReadiness(ctx.org.id, ctx.org.defaultCurrency)]);
  return (
    <>
      <PageHeader title="Finance" description="Donations settle directly to your community's own payment account. Only provider-confirmed payments are counted." />
      {!ready.ready && <Notice tone="warning" className="mb-6" title="Donations are not being accepted">{ready.reason} <Link className="underline" href={`/o/${slug}/finance/setup`}>Payment account setup</Link></Notice>}
      {conn && <p className="mb-4 text-sm text-muted">Payment account: <strong>{conn.provider}</strong> · {CONNECTION_STATUS_COPY[conn.status].label}</p>}
      {summary.currencies.length === 0 ? (
        <Card><p className="text-sm text-muted">No confirmed donations yet.</p></Card>
      ) : (
        summary.currencies.map((c) => (
          <div key={c.currency} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-muted">{c.currency}</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Donated (confirmed)" value={formatMoney(c.gross, c.currency)} />
              <Stat label="Processing fees" value={formatMoney(c.processing, c.currency)} hint="Reported by the provider" />
              <Stat label="Refunds & disputes" value={formatMoney(c.refunds + c.disputes, c.currency)} />
              <Stat label="Net due to you" value={formatMoney(c.net, c.currency)} hint={c.platform ? `After ${formatMoney(c.platform, c.currency)} platform fees` : "No platform fees"} />
            </div>
            <p className="mt-2 text-xs text-muted">Settlement to your bank is handled by the provider on its schedule. &ldquo;Net due&rdquo; is not money already in your bank account.</p>
          </div>
        ))
      )}
      {summary.pendingCount > 0 && <p className="mb-4 text-sm text-muted">{summary.pendingCount} payment(s) awaiting provider confirmation.</p>}
      <Card className="p-0">
        <div className="flex items-center justify-between p-5 pb-2"><CardTitle>Recent donations</CardTitle><Link href={`/o/${slug}/finance/donations`} className="text-sm text-plum-700 underline">All donations</Link></div>
        <ul className="divide-y divide-line">
          {recent.map((d) => (
            <li key={d.id}>
              <Link href={`/o/${slug}/finance/donations/${d.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-violet-50">
                <span>{d.anonymous ? "Anonymous" : (d.donorName ?? "Guest")} · {d.campaign?.title}</span>
                <span className="flex items-center gap-2">{formatMoney(d.amount, d.currency)} <DonationStatusBadge status={d.status} /> <span className="text-xs text-muted">{formatInZone(d.createdAt, user.timezone, "d LLL")}</span></span>
              </Link>
            </li>
          ))}
          {recent.length === 0 && <li className="px-5 py-4 text-sm text-muted">No donations yet.</li>}
        </ul>
      </Card>
    </>
  );
}
