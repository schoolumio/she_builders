import "server-only";
import type { OrgStatus, OrgVerification, SupportStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { ForbiddenError, NotFoundError } from "../errors";
import { parseInput } from "../validate";
import { audit } from "../audit";
import { rateLimit } from "../rate-limit";
import type { Actor } from "../tenancy/context";
import { emailSchema, optionalText } from "@/lib/validation";
import { getRealtimeProvider } from "../realtime";
import { allProviders } from "../payments/providers";
import { billingProviderName } from "../billing/service";
import { isEmailConfigured } from "../email";

function requireSuper(actor: Actor) {
  if (actor.platformRole !== "SUPER_ADMIN") throw new ForbiddenError();
}

function requireStaff(actor: Actor) {
  if (!actor.platformRole) throw new ForbiddenError();
}

/** Organisation metadata only — no prayer requests, testimonies, donor details or member content. */
export async function listOrganizationsForPlatform(actor: Actor, q?: string) {
  requireStaff(actor);
  return db.organization.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] } : {},
    select: {
      id: true,
      slug: true,
      name: true,
      country: true,
      status: true,
      verification: true,
      createdAt: true,
      subscription: { select: { status: true, plan: { select: { code: true, name: true } } } },
      _count: { select: { memberships: { where: { status: "ACTIVE" } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function getOrganizationForPlatform(actor: Actor, id: string) {
  requireStaff(actor);
  const org = await db.organization.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      country: true,
      timezone: true,
      contactEmail: true,
      websiteUrl: true,
      status: true,
      suspendedReason: true,
      verification: true,
      visibility: true,
      fundraisingEnabled: true,
      createdAt: true,
      subscription: { include: { plan: true } },
      paymentConnections: {
        select: { id: true, provider: true, status: true, accountName: true, bankName: true, accountLast4: true, chargesEnabled: true, payoutsEnabled: true, requirements: true, platformReviewedAt: true, reviewNote: true, createdAt: true },
      },
      _count: { select: { memberships: { where: { status: "ACTIVE" } }, meetings: true, campaigns: true } },
    },
  });
  if (!org) throw new NotFoundError("Organisation not found.");
  const owners = await db.membership.findMany({ where: { organizationId: id, status: "ACTIVE", roles: { has: "OWNER" } }, include: { user: { select: { name: true, email: true } } } });
  return { org, owners: owners.map((o) => o.user) };
}

export async function setOrganizationStatus(actor: Actor, id: string, status: OrgStatus, reason?: string) {
  requireSuper(actor);
  await db.organization.update({ where: { id }, data: { status, suspendedReason: status === "SUSPENDED" ? (reason ?? "Suspended by platform administrator") : null } });
  await audit({ organizationId: id, actorId: actor.id, action: `platform.org_${status.toLowerCase()}`, metadata: { reason: reason ?? null } });
}

export async function setOrganizationVerification(actor: Actor, id: string, verification: OrgVerification) {
  requireSuper(actor);
  await db.organization.update({ where: { id }, data: { verification } });
  await audit({ organizationId: id, actorId: actor.id, action: "platform.org_verification", metadata: { verification } });
}

export async function updatePlan(actor: Actor, planId: string, input: { monthlyPrice: number | null; yearlyPrice: number | null; platformFeeBps: number; trialDays: number; graceDays: number; stripeMonthlyPriceId?: string | null; stripeYearlyPriceId?: string | null; public: boolean }) {
  requireSuper(actor);
  if (input.platformFeeBps < 0 || input.platformFeeBps > 1000) throw new ForbiddenError("Platform fee must be between 0 and 10%.");
  await db.plan.update({ where: { id: planId }, data: input });
  await audit({ actorId: actor.id, action: "platform.plan_updated", targetType: "Plan", targetId: planId, metadata: { platformFeeBps: input.platformFeeBps } });
}

export async function setPlanEntitlement(actor: Actor, planId: string, key: string, enabled: boolean, limit: number | null) {
  requireSuper(actor);
  await db.planEntitlement.upsert({ where: { planId_key: { planId, key } }, create: { planId, key, enabled, limit }, update: { enabled, limit } });
  await audit({ actorId: actor.id, action: "platform.entitlement_updated", targetType: "Plan", targetId: planId, metadata: { key, enabled, limit } });
}

export async function pendingConnectionReviews(actor: Actor) {
  requireStaff(actor);
  return db.paymentProviderConnection.findMany({
    where: { status: { in: ["PENDING_VERIFICATION", "RESTRICTED"] } },
    include: { organization: { select: { id: true, name: true, slug: true, country: true, verification: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function platformAuditLog(actor: Actor, opts: { organizationId?: string; take?: number } = {}) {
  requireStaff(actor);
  return db.auditLog.findMany({
    where: opts.organizationId ? { organizationId: opts.organizationId } : {},
    include: { actor: { select: { name: true, email: true } }, organization: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 200,
  });
}

export async function integrationHealth() {
  const [failedEmails, pendingEmails, unprocessedPayments, lastPaymentEvent] = await Promise.all([
    db.emailOutbox.count({ where: { status: "FAILED" } }),
    db.emailOutbox.count({ where: { status: "PENDING", attempts: { gt: 0 } } }),
    db.paymentWebhookEvent.count({ where: { processedAt: null, receivedAt: { lt: new Date(Date.now() - 10 * 60_000) } } }),
    db.paymentWebhookEvent.findFirst({ orderBy: { receivedAt: "desc" }, select: { receivedAt: true, provider: true } }),
  ]);
  return {
    realtime: { provider: getRealtimeProvider().name, configured: getRealtimeProvider().isConfigured() },
    payments: allProviders().map((p) => ({ id: p.id, name: p.displayName, available: p.isAvailable(), testMode: p.isAvailable() ? p.isTestMode() : null })),
    billing: billingProviderName(),
    email: { configured: isEmailConfigured(), failed: failedEmails, retrying: pendingEmails },
    webhooks: { stuckPaymentEvents: unprocessedPayments, lastPaymentEvent },
  };
}

// Support requests ---------------------------------------------------------------------------

const supportSchema = z.object({
  email: emailSchema,
  subject: z.string().trim().min(3).max(160),
  body: z.string().trim().min(10).max(5000),
  organizationId: optionalText(40),
});

export async function createSupportRequest(userId: string | null, input: unknown, meta: { ipHash: string }) {
  const d = parseInput(supportSchema, input);
  await rateLimit(`support:${meta.ipHash}`, 5, 3600);
  if (d.organizationId && userId) {
    const m = await db.membership.findUnique({ where: { organizationId_userId: { organizationId: d.organizationId, userId } } });
    if (!m) d.organizationId = undefined;
  } else d.organizationId = undefined;
  return db.supportRequest.create({ data: { email: d.email, subject: d.subject, body: d.body, organizationId: d.organizationId ?? null, userId } });
}

export async function listSupportRequests(actor: Actor, status?: SupportStatus) {
  requireStaff(actor);
  return db.supportRequest.findMany({ where: status ? { status } : {}, include: { organization: { select: { name: true, slug: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
}

export async function updateSupportRequest(actor: Actor, id: string, status: SupportStatus, internalNote?: string) {
  requireStaff(actor);
  await db.supportRequest.update({ where: { id }, data: { status, internalNote: internalNote?.slice(0, 2000) } });
  await audit({ actorId: actor.id, action: "platform.support_updated", targetType: "SupportRequest", targetId: id, metadata: { status } });
}

export async function platformStats(actor: Actor) {
  requireStaff(actor);
  const [orgs, active, users, paid] = await Promise.all([
    db.organization.count(),
    db.organization.count({ where: { status: "ACTIVE" } }),
    db.user.count({ where: { status: "ACTIVE" } }),
    db.subscription.count({ where: { status: { in: ["ACTIVE", "TRIALING"] }, plan: { code: { not: "FREE" } } } }),
  ]);
  return { orgs, active, users, paid };
}
