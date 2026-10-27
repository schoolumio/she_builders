import "server-only";
import type { DonationStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { parseInput } from "../validate";
import { audit } from "../audit";
import { env } from "../env";
import { randomToken } from "../crypto";
import { rateLimit } from "../rate-limit";
import { errorMeta, log } from "../log";
import { notify } from "../notifications";
import { renderEmail, sendEmail } from "../email";
import { getEntitlements } from "../billing/entitlements";
import type { Actor, OrgContext } from "../tenancy/context";
import { requirePermission } from "../tenancy/context";
import { getPaymentProvider } from "./providers";
import { donationReadiness } from "./connections";
import { getCampaignForGiving, isCampaignOpen } from "./campaigns";
import { processPaymentEvent } from "./events";
import { ProviderError } from "./types";
import { checkbox, emailSchema, optionalText } from "@/lib/validation";
import { formatMoney, platformFee, toMinorUnits } from "@/lib/money";
import { brand } from "@/config/brand";

const startSchema = z.object({
  amount: z.coerce.number({ error: "Enter an amount." }).positive({ error: "Enter an amount greater than zero." }).max(1e9),
  donorName: optionalText(120),
  donorEmail: z.union([z.literal(""), emailSchema]).optional().transform((v) => v || undefined),
  anonymous: checkbox,
  message: optionalText(500),
});

export type DonationStartResult = { reference: string };

/**
 * Step 1 of giving: validates the amount against the campaign and records a PENDING donation.
 * Organisation, currency, recipient account and fees are all derived on the server; nothing the
 * browser sends can change them.
 */
export async function startDonation(viewer: (Actor & { email: string }) | null, slug: string, campaignId: string, input: unknown, meta: { ipHash: string }) {
  const data = parseInput(startSchema, input);
  await rateLimit(`donate:ip:${meta.ipHash}`, 20, 3600);
  const { campaign } = await getCampaignForGiving(slug, campaignId, viewer?.id);
  if (!isCampaignOpen(campaign)) throw new ValidationError("This campaign is not accepting donations right now.");
  if (!viewer && !campaign.allowGuests) throw new ForbiddenError("Please sign in to give to this campaign.");
  const donorEmail = viewer?.email ?? data.donorEmail;
  if (!donorEmail) throw new ValidationError("Enter your email address for your receipt.", { donorEmail: "Required for your receipt." });
  if (data.anonymous && !campaign.allowAnonymous) throw new ValidationError("This campaign does not accept anonymous gifts.");

  const amount = toMinorUnits(data.amount, campaign.currency);
  if (!campaign.allowCustomAmount && !campaign.suggestedAmounts.includes(amount)) {
    throw new ValidationError("Choose one of the suggested amounts.", { amount: "Choose a suggested amount." });
  }
  if (amount < campaign.minAmount || amount > campaign.maxAmount) {
    throw new ValidationError(
      `Enter an amount between ${formatMoney(campaign.minAmount, campaign.currency)} and ${formatMoney(campaign.maxAmount, campaign.currency)}.`,
      { amount: "Outside the allowed range." },
    );
  }

  const readiness = await donationReadiness(campaign.organizationId, campaign.currency);
  if (!readiness.ready) throw new AppError(readiness.reason);
  const ent = await getEntitlements(campaign.organizationId);

  const donation = await db.donation.create({
    data: {
      organizationId: campaign.organizationId,
      campaignId: campaign.id,
      connectionId: readiness.connection.id,
      provider: readiness.connection.provider,
      purpose: "DONATION",
      donorUserId: viewer?.id ?? null,
      donorName: viewer?.name ?? data.donorName ?? null,
      donorEmail,
      anonymous: data.anonymous,
      message: data.message ?? null,
      reference: `don_${randomToken(18)}`,
      currency: campaign.currency,
      amount,
      platformFeeAmount: platformFee(amount, ent.plan.platformFeeBps),
    },
  });
  return { reference: donation.reference } satisfies DonationStartResult;
}

/** Loads a donation by its unguessable reference. Signed-in donors may only see their own. */
export async function getDonationByReference(reference: string, viewerId?: string | null) {
  if (!/^(don|gift)_[A-Za-z0-9_-]{10,40}$/.test(reference)) throw new NotFoundError("Donation not found.");
  const d = await db.donation.findUnique({
    where: { reference },
    include: { organization: { select: { id: true, name: true, slug: true, logoUrl: true } }, campaign: { select: { id: true, title: true, terms: true } } },
  });
  if (!d) throw new NotFoundError("Donation not found.");
  if (d.donorUserId && viewerId !== d.donorUserId) throw new NotFoundError("Donation not found.");
  return d;
}

/** Step 2: after the donor reviewed the disclosures, create (or reuse) the hosted checkout. */
export async function createCheckout(reference: string, viewerId?: string | null) {
  const d = await getDonationByReference(reference, viewerId);
  if (d.status !== "PENDING") throw new ConflictError("This donation has already been processed.");
  if (d.checkoutUrl) return d.checkoutUrl;
  // Re-check readiness at payment time: the account could have been restricted since step 1.
  const readiness = await donationReadiness(d.organizationId, d.currency);
  if (!readiness.ready || readiness.connection.id !== d.connectionId) throw new AppError(readiness.ready ? "This donation must be restarted." : readiness.reason);
  const provider = getPaymentProvider(d.provider);
  const result = `${env.appUrl}/donations/${d.reference}`;
  let checkout;
  try {
    checkout = await provider.createCheckout({
      reference: d.reference,
      amount: d.amount,
      currency: d.currency,
      platformFee: d.platformFeeAmount,
      accountId: readiness.connection.providerAccountId!,
      donorEmail: d.donorEmail!,
      description: d.purpose === "GIFT" ? `Gift to ${d.organization.name}` : `Donation to ${d.organization.name}${d.campaign ? ` — ${d.campaign.title}` : ""}`,
      successUrl: result,
      cancelUrl: `${result}?cancelled=1`,
      metadata: { organizationId: d.organizationId, donationId: d.id, purpose: d.purpose },
    });
  } catch (e) {
    if (e instanceof ProviderError) {
      log.warn("payments.checkout_failed", { donationId: d.id, ...errorMeta(e) });
      throw new AppError(e.userMessage);
    }
    throw e;
  }
  await db.donation.update({ where: { id: d.id }, data: { checkoutUrl: checkout.checkoutUrl, providerPaymentId: checkout.providerPaymentId ?? null } });
  return checkout.checkoutUrl;
}

export async function afterDonationSucceeded(donationId: string) {
  const d = await db.donation.findUniqueOrThrow({ where: { id: donationId }, include: { organization: true, campaign: true } });
  if (d.purpose === "GIFT") {
    const { completePaidGift } = await import("../gifts/service");
    await completePaidGift(d.id);
  }
  if (d.donorEmail && !d.receiptSentAt) {
    const claimed = await db.donation.updateMany({ where: { id: d.id, receiptSentAt: null }, data: { receiptSentAt: new Date() } });
    if (claimed.count === 1) {
      const { text, html } = renderEmail({
        heading: d.purpose === "GIFT" ? "Thank you for your gift" : "Thank you for your donation",
        paragraphs: [
          `Your payment of ${formatMoney(d.amount, d.currency)} to ${d.organization.name}${d.campaign ? ` (${d.campaign.title})` : ""} has been confirmed by the payment provider.`,
          `Receipt number: ${d.receiptNumber}`,
          `Recipient: ${d.organization.name}. ${brand.companyName} provides the software only and does not receive these funds.`,
          "This confirmation is not a tax receipt unless the recipient organisation tells you otherwise.",
        ],
        action: { label: "View receipt", url: `${env.appUrl}/donations/${d.reference}` },
      });
      await sendEmail({ to: d.donorEmail, subject: `Receipt ${d.receiptNumber} — ${d.organization.name}`, text, html, category: "FUNDRAISING" });
    }
  }
  if (d.donorUserId) {
    await notify({ userIds: [d.donorUserId], organizationId: d.organizationId, category: "FUNDRAISING", title: `Payment confirmed: ${formatMoney(d.amount, d.currency)}`, link: `/donations/${d.reference}` });
  }
}

// ---------------------------------------------------------------------------------------------
// Finance administration
// ---------------------------------------------------------------------------------------------

export async function listDonations(ctx: OrgContext, opts: { status?: DonationStatus; campaignId?: string; purpose?: "DONATION" | "GIFT"; take?: number; from?: Date; to?: Date } = {}) {
  requirePermission(ctx, "finance.view");
  const where: Prisma.DonationWhereInput = {
    organizationId: ctx.org.id,
    purpose: opts.purpose ?? "DONATION",
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.campaignId ? { campaignId: opts.campaignId } : {}),
    ...(opts.from || opts.to ? { createdAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lt: opts.to } : {}) } } : {}),
  };
  return db.donation.findMany({ where, include: { campaign: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: opts.take ?? 200 });
}

export async function getDonationForFinance(ctx: OrgContext, donationId: string) {
  requirePermission(ctx, "finance.view");
  const d = await db.donation.findFirst({
    where: { id: donationId, organizationId: ctx.org.id },
    include: { campaign: true, refunds: { orderBy: { createdAt: "desc" } }, disputes: true, ledgerEntries: { orderBy: { createdAt: "asc" } }, connection: true },
  });
  if (!d) throw new NotFoundError("Donation not found.");
  return d;
}

/** Totals by currency. Only provider-confirmed money counts as received. */
export async function financeSummary(ctx: OrgContext) {
  requirePermission(ctx, "finance.view");
  const rows = await db.ledgerEntry.groupBy({ by: ["currency", "type"], where: { organizationId: ctx.org.id, donation: { purpose: "DONATION" } }, _sum: { amount: true } });
  const pending = await db.donation.groupBy({ by: ["currency"], where: { organizationId: ctx.org.id, purpose: "DONATION", status: "PENDING" }, _count: true });
  const byCurrency = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const m = byCurrency.get(r.currency) ?? {};
    m[r.type] = r._sum.amount ?? 0;
    byCurrency.set(r.currency, m);
  }
  return {
    currencies: [...byCurrency.entries()].map(([currency, t]) => {
      const gross = t.CHARGE ?? 0;
      const processing = -(t.PROCESSING_FEE ?? 0);
      const platform = -(t.PLATFORM_FEE ?? 0);
      const refunds = -(t.REFUND ?? 0);
      const disputes = -((t.DISPUTE_HOLD ?? 0) + (t.DISPUTE_RELEASE ?? 0));
      const settled = t.SETTLEMENT ?? 0;
      return { currency, gross, processing, platform, refunds, disputes, net: gross - processing - platform - refunds - disputes, settled };
    }),
    pendingCount: pending.reduce((s, p) => s + p._count, 0),
  };
}

const refundSchema = z.object({ amount: z.coerce.number().positive(), reason: optionalText(500) });

export async function requestRefund(ctx: OrgContext, donationId: string, input: unknown) {
  requirePermission(ctx, "finance.manage");
  const data = parseInput(refundSchema, input);
  const d = await getDonationForFinance(ctx, donationId);
  if (!["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(d.status)) throw new ConflictError("Only successful donations can be refunded.");
  const amount = toMinorUnits(data.amount, d.currency);
  const pendingRefunds = d.refunds.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.amount, 0);
  if (amount > d.amount - d.amountRefunded - pendingRefunds) throw new ValidationError("The refund exceeds the refundable amount.", { amount: "Too large." });
  const provider = getPaymentProvider(d.provider);
  if (!provider.capabilities.refunds || !provider.isAvailable()) throw new AppError("Refunds are not available for this provider.");
  await rateLimit(`refund:${ctx.org.id}`, 30, 3600);
  const refund = await db.refund.create({
    data: { organizationId: ctx.org.id, donationId: d.id, amount, currency: d.currency, reason: data.reason ?? null, requestedById: ctx.actor.id },
  });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "payments.refund_requested", targetType: "Donation", targetId: d.id, metadata: { amount } });
  let res;
  try {
    res = await provider.refund({ reference: d.reference, providerPaymentId: d.providerPaymentId ?? d.providerChargeId ?? "", amount, accountId: d.connection.providerAccountId! });
  } catch (e) {
    await db.refund.update({ where: { id: refund.id }, data: { status: "FAILED" } });
    if (e instanceof ProviderError) throw new AppError(e.userMessage);
    throw e;
  }
  await db.refund.update({ where: { id: refund.id }, data: { providerRefundId: res.providerRefundId, status: res.status === "failed" ? "FAILED" : "PENDING" } });
  if (res.status === "succeeded") {
    // Provider confirmed synchronously (server-to-server response) — record it through the same idempotent path.
    await processPaymentEvent(d.provider, {
      eventId: `refund-sync:${res.providerRefundId}`,
      kind: "refund.succeeded",
      reference: d.reference,
      providerChargeId: d.providerChargeId,
      providerRefundId: res.providerRefundId,
      amount,
      currency: d.currency,
      accountId: null,
    });
  }
  return res;
}

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function exportDonationsCsv(ctx: OrgContext, opts: { from?: Date; to?: Date } = {}) {
  requirePermission(ctx, "finance.view");
  const rows = await listDonations(ctx, { ...opts, take: 10_000 });
  const header = ["created_at", "reference", "receipt", "status", "campaign", "donor", "currency", "amount", "processing_fee", "platform_fee", "refunded", "net", "provider", "paid_at"];
  const lines = rows.map((d) =>
    [
      d.createdAt.toISOString(),
      d.reference,
      d.receiptNumber,
      d.status,
      d.campaign?.title,
      d.anonymous ? "Anonymous" : (d.donorName ?? ""),
      d.currency,
      d.amount,
      d.processingFeeAmount,
      d.platformFeeAmount,
      d.amountRefunded,
      d.netAmount,
      d.provider,
      d.paidAt?.toISOString(),
    ]
      .map(csvCell)
      .join(","),
  );
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "payments.export", metadata: { rows: rows.length } });
  return [header.join(","), ...lines].join("\n") + "\n";
}

export async function listMyDonations(userId: string) {
  return db.donation.findMany({
    where: { donorUserId: userId, status: { not: "PENDING" } },
    include: { organization: { select: { name: true, slug: true } }, campaign: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
