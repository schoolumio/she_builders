import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pageOrgContext } from "@/server/page";
import { db } from "@/server/db";
import { campaignTotals } from "@/server/payments/campaigns";
import { can } from "@/server/tenancy/context";
import { formatMoney } from "@/lib/money";
import { STATUS_TONE } from "./status";

export const metadata = { title: "Campaigns" };


export default async function CampaignsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug, ["campaigns.draft", "finance.view"]);
  const campaigns = await db.fundraisingCampaign.findMany({ where: { organizationId: ctx.org.id }, orderBy: { createdAt: "desc" } });
  const totals = can(ctx, "finance.view") ? await Promise.all(campaigns.map((c) => campaignTotals(c.id))) : [];
  return (
    <>
      <PageHeader title="Campaigns" description="Campaigns are published only after approval by a finance administrator or owner." actions={can(ctx, "campaigns.draft") ? <LinkButton href={`/o/${slug}/finance/campaigns/new`}>New campaign</LinkButton> : undefined} />
      {campaigns.length === 0 ? <EmptyState title="No campaigns yet" /> : (
        <div className="space-y-3">
          {campaigns.map((c, i) => (
            <Link key={c.id} href={`/o/${slug}/finance/campaigns/${c.id}`} className="block">
              <Card className="flex flex-col gap-2 hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{c.title}</p>
                  {totals[i] && <p className="text-sm text-muted">{formatMoney(totals[i]!.raised, c.currency)} confirmed from {totals[i]!.count} donation{totals[i]!.count === 1 ? "" : "s"}{c.targetAmount ? ` · target ${formatMoney(c.targetAmount, c.currency)}` : ""}</p>}
                </div>
                <Badge tone={STATUS_TONE[c.status]}>{c.status.toLowerCase().replace("_", " ")}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
