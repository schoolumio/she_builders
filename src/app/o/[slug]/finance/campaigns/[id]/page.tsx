import { notFound } from "next/navigation";
import { Card, CardTitle, Notice, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton, TextAreaField } from "@/components/ui/form";
import { InlineAction } from "@/components/ui/inline-action";
import { CampaignFields } from "@/components/campaign-fields";
import { pageOrgContext } from "@/server/page";
import { db } from "@/server/db";
import { campaignTotals } from "@/server/payments/campaigns";
import { donationReadiness } from "@/server/payments/connections";
import { can } from "@/server/tenancy/context";
import { formatMoney } from "@/lib/money";
import { STATUS_TONE } from "../status";
import { campaignDecisionAction, campaignImageAction, campaignUpdateAction, updateCampaignAction } from "../../actions";

export default async function CampaignPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await pageOrgContext(slug, ["campaigns.draft", "finance.view"]);
  const c = await db.fundraisingCampaign.findFirst({ where: { id, organizationId: ctx.org.id }, include: { updates: { orderBy: { createdAt: "desc" } } } });
  if (!c) notFound();
  const finance = can(ctx, "finance.manage");
  const [totals, ready] = await Promise.all([campaignTotals(c.id), donationReadiness(ctx.org.id, c.currency)]);
  const decide = campaignDecisionAction.bind(null, slug);
  const live = c.status === "ACTIVE" || c.status === "PAUSED";
  return (
    <>
      <PageHeader
        title={c.title}
        eyebrow="Campaign"
        actions={
          <>
            <Badge tone={STATUS_TONE[c.status]}>{c.status.toLowerCase().replace("_", " ")}</Badge>
            {(c.status === "DRAFT" || c.status === "REJECTED") && <InlineAction action={decide} fields={{ id: c.id, decision: "submit" }}>Submit for approval</InlineAction>}
            {finance && (c.status === "DRAFT" || c.status === "PENDING_APPROVAL") && <InlineAction action={decide} fields={{ id: c.id, decision: "approve" }} variant="primary">Approve & publish</InlineAction>}
            {finance && c.status === "PENDING_APPROVAL" && <InlineAction action={decide} fields={{ id: c.id, decision: "reject" }}>Reject</InlineAction>}
            {finance && c.status === "ACTIVE" && <InlineAction action={decide} fields={{ id: c.id, decision: "pause" }}>Pause</InlineAction>}
            {finance && c.status === "PAUSED" && <InlineAction action={decide} fields={{ id: c.id, decision: "resume" }}>Resume</InlineAction>}
            {finance && live && <InlineAction action={decide} fields={{ id: c.id, decision: "end" }} variant="ghost" confirm="End this campaign? No further donations will be accepted.">End</InlineAction>}
          </>
        }
      />
      {c.status === "ACTIVE" && !ready.ready && <Notice tone="warning" className="mb-4" title="Published, but donations are blocked">{ready.reason}</Notice>}
      {c.status === "ACTIVE" && ready.ready && <Notice tone="success" className="mb-4">Live at <a className="underline" href={`/c/${slug}/give/${c.id}`}>/c/{slug}/give/{c.id}</a></Notice>}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardTitle>Details</CardTitle>
          <ActionForm action={updateCampaignAction.bind(null, slug)} className="mt-3">
            <input type="hidden" name="id" value={c.id} />
            <CampaignFields c={c} defaultCurrency={ctx.org.defaultCurrency} currencyLocked={live} />
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Card>
        <div className="space-y-6">
          {can(ctx, "finance.view") && (
            <Card>
              <CardTitle>Progress</CardTitle>
              <p className="mt-2 text-2xl font-semibold">{formatMoney(totals.raised, c.currency)}</p>
              <p className="text-sm text-muted">confirmed from {totals.count} donation{totals.count === 1 ? "" : "s"}{c.targetAmount ? ` of ${formatMoney(c.targetAmount, c.currency)}` : ""}</p>
            </Card>
          )}
          <Card>
            <CardTitle>Campaign image</CardTitle>
            {c.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.imageUrl} alt="" className="mt-2 aspect-video w-full rounded object-cover" />
            )}
            <ActionForm action={campaignImageAction.bind(null, slug)} className="mt-3" encType="multipart/form-data">
              <input type="hidden" name="id" value={c.id} />
              <label htmlFor="cimg" className="sr-only">Image file</label>
              <input id="cimg" type="file" name="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm" />
              <SubmitButton size="sm" variant="secondary">Upload</SubmitButton>
            </ActionForm>
          </Card>
          {finance && (
            <Card>
              <CardTitle>Updates for donors</CardTitle>
              <ActionForm action={campaignUpdateAction.bind(null, slug)} className="mt-3" resetOnSuccess>
                <input type="hidden" name="id" value={c.id} />
                <TextAreaField label="Post an update" name="body" rows={3} />
                <SubmitButton size="sm">Post</SubmitButton>
              </ActionForm>
              <ul className="mt-3 space-y-2 text-sm">{c.updates.map((u) => <li key={u.id} className="border-l-2 border-gold-500 pl-3">{u.body}</li>)}</ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
