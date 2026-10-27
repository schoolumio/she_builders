import "server-only";
import type { PaymentProviderConnection, PaymentProviderId } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError, AppError } from "../errors";
import { parseInput } from "../validate";
import { audit } from "../audit";
import { env } from "../env";
import { errorMeta, log } from "../log";
import { rateLimit } from "../rate-limit";
import { assertFeature } from "../billing/entitlements";
import type { Actor, OrgContext } from "../tenancy/context";
import { requireActiveOrg, requirePermission } from "../tenancy/context";
import { getPaymentProvider } from "./providers";
import { deriveConnectionStatus } from "./status";
import { ProviderError, type AccountSnapshot } from "./types";

const OPEN_STATUSES = ["ONBOARDING_REQUIRED", "PENDING_VERIFICATION", "VERIFIED", "RESTRICTED"] as const;

function providerFailure(e: unknown): never {
  if (e instanceof ProviderError) {
    log.warn("payments.provider_error", errorMeta(e));
    throw new AppError(e.userMessage);
  }
  throw e;
}

export async function listConnections(ctx: OrgContext) {
  requirePermission(ctx, "finance.view");
  return db.paymentProviderConnection.findMany({ where: { organizationId: ctx.org.id }, orderBy: { createdAt: "desc" } });
}

export async function activeConnection(organizationId: string) {
  return db.paymentProviderConnection.findFirst({
    where: { organizationId, status: { in: [...OPEN_STATUSES] } },
    orderBy: { createdAt: "desc" },
  });
}

/** Applies a provider snapshot to a connection and recomputes its status. */
export async function applySnapshot(conn: PaymentProviderConnection, snapshot: AccountSnapshot) {
  const provider = getPaymentProvider(conn.provider);
  const status = conn.status === "DISCONNECTED" ? "DISCONNECTED" : deriveConnectionStatus(snapshot, provider.capabilities, !!conn.platformReviewedAt);
  const updated = await db.paymentProviderConnection.update({
    where: { id: conn.id },
    data: {
      providerAccountId: snapshot.providerAccountId,
      status,
      accountName: snapshot.accountName ?? conn.accountName,
      bankName: snapshot.bankName ?? conn.bankName,
      accountLast4: snapshot.accountLast4 ?? conn.accountLast4,
      country: snapshot.country ?? conn.country,
      currencies: snapshot.currencies.length ? snapshot.currencies : conn.currencies,
      chargesEnabled: snapshot.chargesEnabled,
      payoutsEnabled: snapshot.payoutsEnabled,
      requirements: snapshot.requirements,
      providerApproved: snapshot.providerStatus === "verified" && snapshot.chargesEnabled,
      lastSyncedAt: new Date(),
    },
  });
  if (updated.status !== conn.status) {
    await audit({
      organizationId: conn.organizationId,
      action: "payments.connection_status_changed",
      targetType: "PaymentProviderConnection",
      targetId: conn.id,
      metadata: { from: conn.status, to: updated.status },
    });
  }
  return updated;
}

const bankSchema = z.object({
  bankCode: z.string().trim().min(2).max(20),
  accountNumber: z.string().trim().regex(/^\d{6,20}$/, { error: "Enter digits only." }),
  businessName: z.string().trim().min(2).max(120),
});

/** Starts (or resumes) onboarding with a provider. Bank details, when needed, go straight to the provider. */
export async function startOnboarding(ctx: OrgContext, providerId: PaymentProviderId, input: unknown) {
  requirePermission(ctx, "finance.manage");
  requireActiveOrg(ctx);
  await assertFeature(ctx.org.id, "feature.fundraising");
  await rateLimit(`payments:onboard:${ctx.org.id}`, 20, 3600);
  const provider = getPaymentProvider(providerId);
  if (!provider.isAvailable()) throw new ValidationError(`${provider.displayName} is not available on this platform yet.`);

  const current = await activeConnection(ctx.org.id);
  if (current && current.provider !== providerId) {
    throw new ConflictError(`Disconnect the existing ${getPaymentProvider(current.provider).displayName} account before connecting another provider.`);
  }
  const bankDetails = provider.capabilities.bankDetailsForm ? parseInput(bankSchema, input) : undefined;
  const conn =
    current ??
    (await db.paymentProviderConnection.create({
      data: { organizationId: ctx.org.id, provider: providerId, status: "ONBOARDING_REQUIRED", createdById: ctx.actor.id },
    }));
  const base = `${env.appUrl}/o/${ctx.org.slug}/finance/setup`;
  let result;
  try {
    result = await provider.startOnboarding({
      existingAccountId: conn.providerAccountId,
      organizationId: ctx.org.id,
      country: ctx.org.country,
      email: ctx.org.contactEmail ?? ctx.actor.email,
      returnUrl: `${base}?return=1`,
      refreshUrl: `${base}?refresh=1`,
      bankDetails: bankDetails ? { ...bankDetails, contactEmail: ctx.org.contactEmail ?? ctx.actor.email } : undefined,
    });
  } catch (e) {
    providerFailure(e);
  }
  const updated = await applySnapshot(conn, result.snapshot);
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "payments.onboarding_started", targetType: "PaymentProviderConnection", targetId: conn.id, metadata: { provider: providerId } });
  return { connection: updated, redirectUrl: result.redirectUrl };
}

export async function refreshConnection(ctx: OrgContext, connectionId: string) {
  requirePermission(ctx, "finance.manage");
  const conn = await db.paymentProviderConnection.findFirst({ where: { id: connectionId, organizationId: ctx.org.id } });
  if (!conn) throw new NotFoundError("Connection not found.");
  if (!conn.providerAccountId || conn.status === "DISCONNECTED") return conn;
  try {
    return await applySnapshot(conn, await getPaymentProvider(conn.provider).syncAccount(conn.providerAccountId));
  } catch (e) {
    providerFailure(e);
  }
}

/** Provider webhook: account changed. */
export async function syncConnectionByAccount(providerId: PaymentProviderId, accountId: string) {
  const conn = await db.paymentProviderConnection.findUnique({ where: { provider_providerAccountId: { provider: providerId, providerAccountId: accountId } } });
  if (!conn || conn.status === "DISCONNECTED") return null;
  return applySnapshot(conn, await getPaymentProvider(providerId).syncAccount(accountId));
}

export async function disconnect(ctx: OrgContext, connectionId: string) {
  requirePermission(ctx, "finance.manage");
  const conn = await db.paymentProviderConnection.findFirst({ where: { id: connectionId, organizationId: ctx.org.id } });
  if (!conn) throw new NotFoundError("Connection not found.");
  if (conn.status === "DISCONNECTED") return;
  const pending = await db.donation.count({ where: { connectionId: conn.id, status: "PENDING", createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (pending) throw new ConflictError("There are payments in progress on this account. Try again in an hour.");
  await db.paymentProviderConnection.update({ where: { id: conn.id }, data: { status: "DISCONNECTED", disconnectedAt: new Date(), chargesEnabled: false } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "payments.connection_disconnected", targetType: "PaymentProviderConnection", targetId: conn.id });
}

/** BridgeCodes review for providers without hosted KYC (Paystack). Platform admins only. */
export async function platformReviewConnection(admin: Actor, connectionId: string, approve: boolean, note?: string) {
  if (admin.platformRole !== "SUPER_ADMIN") throw new ForbiddenError();
  const conn = await db.paymentProviderConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new NotFoundError("Connection not found.");
  const reviewed = await db.paymentProviderConnection.update({
    where: { id: conn.id },
    data: approve
      ? { platformReviewedAt: new Date(), platformReviewedById: admin.id, reviewNote: note ?? null }
      : { platformReviewedAt: null, platformReviewedById: admin.id, reviewNote: note ?? "Not approved", status: "RESTRICTED" },
  });
  await audit({
    organizationId: conn.organizationId,
    actorId: admin.id,
    action: approve ? "platform.connection_approved" : "platform.connection_rejected",
    targetType: "PaymentProviderConnection",
    targetId: conn.id,
  });
  if (approve && reviewed.providerAccountId) {
    try {
      return await applySnapshot(reviewed, await getPaymentProvider(conn.provider).syncAccount(reviewed.providerAccountId));
    } catch (e) {
      providerFailure(e);
    }
  }
  return reviewed;
}

export async function setFundraisingEnabled(ctx: OrgContext, enabled: boolean) {
  requirePermission(ctx, "finance.manage");
  requireActiveOrg(ctx);
  if (enabled) await assertFeature(ctx.org.id, "feature.fundraising");
  await db.organization.update({ where: { id: ctx.org.id }, data: { fundraisingEnabled: enabled } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: enabled ? "payments.fundraising_enabled" : "payments.fundraising_disabled" });
}

export type DonationReadiness = { ready: true; connection: PaymentProviderConnection } | { ready: false; reason: string };

/** The single gate for accepting live donations for an organisation in a currency. */
export async function donationReadiness(organizationId: string, currency: string): Promise<DonationReadiness> {
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org || org.status !== "ACTIVE") return { ready: false, reason: "This community is not accepting donations." };
  if (!org.fundraisingEnabled) return { ready: false, reason: "Fundraising is turned off for this community." };
  try {
    await assertFeature(organizationId, "feature.fundraising");
  } catch {
    return { ready: false, reason: "Fundraising is not available on this community's plan." };
  }
  const conn = await activeConnection(organizationId);
  if (!conn) return { ready: false, reason: "This community has not connected a payment account." };
  if (conn.status !== "VERIFIED" || !conn.chargesEnabled || !conn.providerAccountId) {
    return { ready: false, reason: "This community's payment account is awaiting verification." };
  }
  const provider = getPaymentProvider(conn.provider);
  if (!provider.isAvailable()) return { ready: false, reason: "Donations are temporarily unavailable." };
  if (conn.currencies.length && !conn.currencies.includes(currency)) {
    return { ready: false, reason: `This community's payment account does not accept ${currency}.` };
  }
  return { ready: true, connection: conn };
}
