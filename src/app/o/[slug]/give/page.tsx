import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { pageOrgContext } from "@/server/page";
import { db } from "@/server/db";
import { campaignTotals, isCampaignOpen } from "@/server/payments/campaigns";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Give" };

export default async function GivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug);
  const campaigns = await db.fundraisingCampaign.findMany({ where: { organizationId: ctx.org.id, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  const open = campaigns.filter((c) => isCampaignOpen(c));
  const totals = await Promise.all(open.map((c) => campaignTotals(c.id)));
  return (
    <>
      <PageHeader title="Give" description={`Donations go directly to ${ctx.org.name}'s own payment account.`} />
      {!ctx.org.fundraisingEnabled || open.length === 0 ? <EmptyState title="No open campaigns" /> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {open.map((c, i) => (
            <Link key={c.id} href={`/c/${slug}/give/${c.id}`} className="block">
              <Card className="h-full transition-shadow hover:shadow-md">
                <p className="font-semibold text-plum-900">{c.title}</p>
                <p className="mt-1 line-clamp-3 text-sm text-muted">{c.description}</p>
                {c.targetAmount && <p className="mt-2 text-xs text-muted">{formatMoney(totals[i]!.raised, c.currency)} confirmed of {formatMoney(c.targetAmount, c.currency)}</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
