import "server-only";
import type { PaymentProviderId, RecurringInterval } from "@prisma/client";
import { db } from "../db";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../errors";
import { audit } from "../audit";
import { env } from "../env";
import { randomToken } from "../crypto";
import { errorMeta, log } from "../log";
import { getEntitlements } from "../billing/entitlements";
import type { Actor, OrgContext } from "../tenancy/context";
import { requirePermission } from "../tenancy/context";
import { getPaymentProvider } from "./providers";
import { donationReadiness } from "./connections";
import { ProviderError } from "./types";

export const INTERVAL_LABEL: Record<RecurringInterval, string> = { WEEKLY: "weekly", MONTHLY: "monthly" };

export function nextChargeAfter(from: Date, interval: RecurringInterval): Date {
  const d = new Date(from);
  if (interval === "WEEKLY") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** Whether recurring giving can be offered for this organisation's current payment account. */
export async function recurringAvailable(organizationId: string, currency: string) {
  const r = await donationReadiness(organizationId, currency);
  if (!r.ready) return false;
  const p = getPaymentProvider(r.connection.provider);
  return p.capabilities.recurring && !!p.createRecurringCheckout;
}

/**
 * Records a recurring donation awaiting the donor's provider checkout. Amount, currency, recipient
 * and fee basis come from the server (validated by the caller exactly like one-time donations).
 * Recurring gifts require a signed-in donor so they can always see and cancel them.
 */
export async function createRecurringDonation(input: {
  donor: Actor & { email: string };
  campaign: { id: string; organizationId: string; currency: string; allowRecurring: boolean };
  amount: number;
  interval: RecurringInterval;
  anonymous: boolean;
}) {
  if (!input.campaign.allowRecurring) throw new ValidationError("This campaign does not offer recurring giving.");
  const readiness = await donationReadiness(input.campaign.organizationId, input.campaign.currency);
  if (!readiness.ready) throw new AppError(readiness.reason);
  const provider = getPaymentProvider(readiness.connection.provider);
  if (!provider.capabilities.recurring || !provider.createRecurringCheckout) {
    throw new ValidationError(`Recurring giving is not available through ${provider.displayName}. Please give a one-time gift.`);
  }
  const ent = await getEntitlements(input.campaign.organizationId);
  return db.recurringDonation.create({
    data: {
      organizationId: input.campaign.organizationId,
      campaignId: input.campaign.id,
      connectionId: readiness.connection.id,
      provider: readiness.connection.provider,
      donorUserId: input.donor.id,
      donorName: input.donor.name,
      donorEmail: input.donor.email,
      anonymous: input.anonymous,
      reference: `rec_${randomToken(18)}`,
      amount: input.amount,
      currency: input.campaign.currency,
      interval: input.interval,
      platformFeeBps: ent.plan.platformFeeBps,
    },
  });
}

export async function getRecurringByReference(reference: string, viewerId: string | null | undefined) {
  if (!/^rec_[A-Za-z0-9_-]{10,40}$/.test(reference)) throw new NotFoundError("Recurring donation not found.");
  const r = await db.recurringDonation.findUnique({
    where: { reference },
    include: { organization: { select: { id: true, name: true, slug: true } }, campaign: { select: { id: true, title: true, terms: true } }, charges: { where: { status: { not: "PENDING" } }, orderBy: { createdAt: "desc" }, take: 24 } },
  });
  if (!r || !viewerId || r.donorUserId !== viewerId) throw new NotFoundError("Recurring donation not found.");
  return r;
}

export async function createRecurringCheckout(reference: string, viewerId: string) {
  const r = await getRecurringByReference(reference, viewerId);
  if (r.status !== "PENDING_SETUP") throw new ConflictError("This recurring donation has already been set up.");
  if (r.checkoutUrl) return r.checkoutUrl;
  const readiness = await donationReadiness(r.organizationId, r.currency);
  if (!readiness.ready || readiness.connection.id !== r.connectionId) throw new AppError(readiness.ready ? "Please start again." : readiness.reason);
  const provider = getPaymentProvider(r.provider);
  const back = `${env.appUrl}/donations/recurring/${r.reference}`;
  try {
    const res = await provider.createRecurringCheckout!({
      reference: r.reference,
      amount: r.amount,
      currency: r.currency,
      interval: r.interval,
      platformFeeBps: r.platformFeeBps,
      accountId: readiness.connection.providerAccountId!,
      donorEmail: r.donorEmail!,
      description: `${r.interval === "WEEKLY" ? "Weekly" : "Monthly"} donation to ${r.organization.name}${r.campaign ? ` — ${r.campaign.title}` : ""}`,
      successUrl: back,
      cancelUrl: `${back}?cancelled=1`,
      metadata: { organizationId: r.organizationId, recurringDonationId: r.id },
    });
    await db.recurringDonation.update({ where: { id: r.id }, data: { checkoutUrl: res.checkoutUrl, providerCheckoutId: res.providerCheckoutId ?? null } });
    return res.checkoutUrl;
  } catch (e) {
    if (e instanceof ProviderError) {
      log.warn("recurring.checkout_failed", { id: r.id, ...errorMeta(e) });
      throw new AppError(e.userMessage);
    }
    throw e;
  }
}

async function cancel(r: { id: string; organizationId: string; provider: PaymentProviderId; providerSubscriptionId: string | null; connectionId: string; status: string }, by: "donor" | "organisation", actorId: string) {
  if (r.status === "CANCELED") return;
  if (r.providerSubscriptionId) {
    const conn = await db.paymentProviderConnection.findUniqueOrThrow({ where: { id: r.connectionId } });
    try {
      await getPaymentProvider(r.provider).cancelRecurring!({ providerSubscriptionId: r.providerSubscriptionId, accountId: conn.providerAccountId! });
    } catch (e) {
      if (e instanceof ProviderError) throw new AppError(e.userMessage);
      throw e;
    }
  }
  await db.recurringDonation.update({ where: { id: r.id }, data: { status: "CANCELED", canceledAt: new Date(), canceledBy: by, nextChargeAt: null } });
  await audit({ organizationId: r.organizationId, actorId, action: "payments.recurring_canceled", targetType: "RecurringDonation", targetId: r.id, metadata: { by } });
}

/** Donors can always stop their own recurring gift; the provider is told first. */
export async function cancelMyRecurringDonation(userId: string, id: string) {
  const r = await db.recurringDonation.findUnique({ where: { id } });
  if (!r || r.donorUserId !== userId) throw new NotFoundError("Recurring donation not found.");
  await cancel(r, "donor", userId);
}

export async function cancelRecurringForOrganisation(ctx: OrgContext, id: string) {
  requirePermission(ctx, "finance.manage");
  const r = await db.recurringDonation.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!r) throw new NotFoundError("Recurring donation not found.");
  await cancel(r, "organisation", ctx.actor.id);
}

export async function listMyRecurringDonations(userId: string) {
  return db.recurringDonation.findMany({
    where: { donorUserId: userId, status: { not: "PENDING_SETUP" } },
    include: { organization: { select: { name: true, slug: true } }, campaign: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listRecurringForOrganisation(ctx: OrgContext) {
  requirePermission(ctx, "finance.view");
  return db.recurringDonation.findMany({
    where: { organizationId: ctx.org.id, status: { not: "PENDING_SETUP" } },
    include: { campaign: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

