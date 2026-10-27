import "server-only";
import type { FundraisingCampaign } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { parseInput } from "../validate";
import { audit } from "../audit";
import { notify } from "../notifications";
import { assertFeature } from "../billing/entitlements";
import type { OrgContext } from "../tenancy/context";
import { can, requireActiveOrg, requirePermission } from "../tenancy/context";
import { checkbox, currencySchema, optionalText } from "@/lib/validation";
import { toMinorUnits } from "@/lib/money";

const amountList = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(/[,\s]+/)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 8),
  );

const optionalAmount = z
  .string()
  .optional()
  .transform((v) => (v ? Number(v) : undefined))
  .refine((n) => n === undefined || (Number.isFinite(n) && n > 0), { error: "Enter a positive amount." });

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? new Date(v) : undefined))
  .refine((d) => !d || !Number.isNaN(d.getTime()), { error: "Invalid date." });

export const campaignSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().min(10).max(8000),
    purpose: z.enum(["GENERAL", "COMMUNITY_ACTIVITY", "CONFERENCE", "OUTREACH", "WELFARE", "EMERGENCY"]),
    beneficiary: optionalText(200),
    currency: currencySchema,
    targetAmount: optionalAmount,
    suggestedAmounts: amountList,
    minAmount: optionalAmount,
    maxAmount: optionalAmount,
    allowCustomAmount: checkbox,
    allowAnonymous: checkbox,
    allowGuests: checkbox,
    visibility: z.enum(["PUBLIC", "MEMBERS"]),
    startsAt: optionalDate,
    endsAt: optionalDate,
    terms: optionalText(4000),
  })
  .refine((d) => !d.startsAt || !d.endsAt || d.endsAt > d.startsAt, { path: ["endsAt"], error: "End must be after start." })
  .refine((d) => d.allowCustomAmount || d.suggestedAmounts.length > 0, { path: ["suggestedAmounts"], error: "Add suggested amounts or allow custom amounts." })
  .refine((d) => !d.minAmount || !d.maxAmount || d.maxAmount >= d.minAmount, { path: ["maxAmount"], error: "Maximum must be at least the minimum." });

function toData(d: z.output<typeof campaignSchema>) {
  const c = d.currency;
  return {
    title: d.title,
    description: d.description,
    purpose: d.purpose,
    beneficiary: d.beneficiary ?? null,
    currency: c,
    targetAmount: d.targetAmount ? toMinorUnits(d.targetAmount, c) : null,
    suggestedAmounts: d.suggestedAmounts.map((a) => toMinorUnits(a, c)),
    minAmount: d.minAmount ? toMinorUnits(d.minAmount, c) : toMinorUnits(1, c),
    maxAmount: d.maxAmount ? toMinorUnits(d.maxAmount, c) : 1_000_000_000,
    allowCustomAmount: d.allowCustomAmount,
    allowAnonymous: d.allowAnonymous,
    // Members-only campaigns never accept guest donors.
    allowGuests: d.visibility === "PUBLIC" && d.allowGuests,
    visibility: d.visibility,
    startsAt: d.startsAt ?? null,
    endsAt: d.endsAt ?? null,
    terms: d.terms ?? null,
  };
}

async function load(ctx: OrgContext, id: string) {
  const c = await db.fundraisingCampaign.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!c) throw new NotFoundError("Campaign not found.");
  return c;
}

export async function createCampaign(ctx: OrgContext, input: unknown) {
  requirePermission(ctx, "campaigns.draft");
  requireActiveOrg(ctx);
  await assertFeature(ctx.org.id, "feature.fundraising");
  const data = toData(parseInput(campaignSchema, input));
  const c = await db.fundraisingCampaign.create({ data: { ...data, organizationId: ctx.org.id, createdById: ctx.actor.id, status: "DRAFT" } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "campaign.created", targetType: "FundraisingCampaign", targetId: c.id });
  return c;
}

export async function updateCampaign(ctx: OrgContext, id: string, input: unknown) {
  requirePermission(ctx, "campaigns.draft");
  requireActiveOrg(ctx);
  const existing = await load(ctx, id);
  const data = toData(parseInput(campaignSchema, input));
  if (existing.status === "ACTIVE" || existing.status === "PAUSED") {
    // Live campaigns cannot change currency (donations already reference it).
    if (data.currency !== existing.currency) throw new ConflictError("The currency of a published campaign cannot be changed.");
    if (!can(ctx, "finance.manage")) throw new ForbiddenError("Only finance administrators can edit a published campaign.");
  }
  await db.fundraisingCampaign.update({ where: { id: existing.id }, data });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "campaign.updated", targetType: "FundraisingCampaign", targetId: existing.id });
}

export async function submitCampaignForApproval(ctx: OrgContext, id: string) {
  requirePermission(ctx, "campaigns.draft");
  const c = await load(ctx, id);
  if (c.status !== "DRAFT" && c.status !== "REJECTED") throw new ConflictError("Only drafts can be submitted.");
  await db.fundraisingCampaign.update({ where: { id: c.id }, data: { status: "PENDING_APPROVAL" } });
  const approvers = await db.membership.findMany({
    where: { organizationId: ctx.org.id, status: "ACTIVE", roles: { hasSome: ["OWNER", "FINANCE_ADMIN"] }, userId: { not: ctx.actor.id } },
    select: { userId: true },
  });
  await notify({ userIds: approvers.map((a) => a.userId), organizationId: ctx.org.id, category: "FUNDRAISING", title: `Campaign awaiting approval: ${c.title}`, link: `/o/${ctx.org.slug}/finance/campaigns/${c.id}` });
}

/** Publication requires finance.manage. A campaign can be approved before the account is verified, but donations stay blocked. */
export async function decideCampaign(ctx: OrgContext, id: string, decision: "approve" | "reject" | "pause" | "resume" | "end") {
  requirePermission(ctx, "finance.manage");
  requireActiveOrg(ctx);
  const c = await load(ctx, id);
  const next: Record<typeof decision, { from: FundraisingCampaign["status"][]; to: FundraisingCampaign["status"] }> = {
    approve: { from: ["DRAFT", "PENDING_APPROVAL"], to: "ACTIVE" },
    reject: { from: ["PENDING_APPROVAL"], to: "REJECTED" },
    pause: { from: ["ACTIVE"], to: "PAUSED" },
    resume: { from: ["PAUSED"], to: "ACTIVE" },
    end: { from: ["ACTIVE", "PAUSED"], to: "ENDED" },
  };
  const rule = next[decision];
  if (!rule.from.includes(c.status)) throw new ConflictError(`This campaign cannot be ${decision}d from its current state.`);
  await db.fundraisingCampaign.update({
    where: { id: c.id },
    data: { status: rule.to, ...(decision === "approve" ? { approvedById: ctx.actor.id, approvedAt: new Date() } : {}) },
  });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: `campaign.${decision}`, targetType: "FundraisingCampaign", targetId: c.id });
}

export async function addCampaignUpdate(ctx: OrgContext, id: string, body: string) {
  requirePermission(ctx, "finance.manage");
  const c = await load(ctx, id);
  const text = body.trim().slice(0, 4000);
  if (text.length < 3) return;
  await db.campaignUpdate.create({ data: { campaignId: c.id, body: text, authorId: ctx.actor.id } });
}

export function isCampaignOpen(c: Pick<FundraisingCampaign, "status" | "startsAt" | "endsAt">, now = new Date()) {
  return c.status === "ACTIVE" && (!c.startsAt || c.startsAt <= now) && (!c.endsAt || c.endsAt > now);
}

export async function campaignTotals(campaignId: string) {
  const agg = await db.donation.aggregate({
    where: { campaignId, purpose: "DONATION", status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "DISPUTED"] } },
    _sum: { amount: true, amountRefunded: true },
    _count: true,
  });
  return { raised: (agg._sum.amount ?? 0) - (agg._sum.amountRefunded ?? 0), count: agg._count };
}

/** Public/member lookup used by giving pages. */
export async function getCampaignForGiving(slug: string, campaignId: string, viewerId?: string) {
  const c = await db.fundraisingCampaign.findFirst({
    where: { id: campaignId, organization: { slug, status: "ACTIVE" } },
    include: { organization: true, updates: { orderBy: { createdAt: "desc" }, take: 5 } },
  });
  if (!c || !["ACTIVE", "PAUSED", "ENDED"].includes(c.status)) throw new NotFoundError("Campaign not found.");
  let isMember = false;
  if (viewerId) {
    const m = await db.membership.findUnique({ where: { organizationId_userId: { organizationId: c.organizationId, userId: viewerId } } });
    isMember = m?.status === "ACTIVE";
  }
  if (c.visibility === "MEMBERS" && !isMember) throw new NotFoundError("Campaign not found.");
  if (c.organization.visibility === "PRIVATE" && !isMember) throw new NotFoundError("Campaign not found.");
  return { campaign: c, isMember };
}
