import "server-only";
import type { Donation, PaymentProviderId, Prisma } from "@prisma/client";
import { db, type Tx } from "../db";
import { audit } from "../audit";
import { errorMeta, log } from "../log";
import { randomToken } from "../crypto";
import { canTransition } from "./status";
import type { NormalizedPaymentEvent, VerifiedPayment } from "./types";
import { syncConnectionByAccount } from "./connections";
import { getPaymentProvider } from "./providers";

export type EventOutcome = "processed" | "duplicate" | "ignored" | "not_found" | "mismatch" | "no_op";

async function findDonation(provider: PaymentProviderId, reference: string | null, chargeId: string | null) {
  const include = { connection: true } as const;
  if (reference) {
    const d = await db.donation.findUnique({ where: { reference }, include });
    if (d && d.provider === provider) return d;
  }
  if (chargeId) return db.donation.findFirst({ where: { provider, providerChargeId: chargeId }, include });
  return null;
}

type DonationWithConnection = NonNullable<Awaited<ReturnType<typeof findDonation>>>;

/**
 * Compares a provider-confirmed payment with the server-side donation record. Amount, currency and
 * recipient account must all match; otherwise the payment is NOT credited and is flagged for review.
 */
export function paymentMatchesDonation(d: Pick<Donation, "amount" | "currency"> & { connection: { providerAccountId: string | null } }, p: VerifiedPayment) {
  const problems: string[] = [];
  if (p.amount !== d.amount) problems.push("amount");
  if (!p.currency || p.currency.toUpperCase() !== d.currency) problems.push("currency");
  // Providers that report the recipient must report OUR recorded recipient.
  if (p.accountId && p.accountId !== d.connection.providerAccountId) problems.push("recipient");
  return problems;
}

function receiptNumber(d: Pick<Donation, "createdAt">) {
  return `R-${d.createdAt.toISOString().slice(0, 10).replace(/-/g, "")}-${randomToken(5).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`;
}

async function ledger(tx: Tx, d: Pick<Donation, "id" | "organizationId" | "currency">, type: Prisma.LedgerEntryCreateManyInput["type"], amount: number, sourceEventId: string, description?: string) {
  if (amount === 0) return;
  await tx.ledgerEntry.createMany({
    data: [{ organizationId: d.organizationId, donationId: d.id, type, amount, currency: d.currency, sourceEventId, description }],
    skipDuplicates: true,
  });
}

async function markSucceeded(d: DonationWithConnection, p: VerifiedPayment, sourceEventId: string): Promise<EventOutcome> {
  const mismatch = paymentMatchesDonation(d, p);
  if (mismatch.length) {
    log.error("payments.verification_mismatch", { donationId: d.id, fields: mismatch, provider: d.provider });
    await db.donation.update({ where: { id: d.id }, data: { failureReason: `Verification mismatch: ${mismatch.join(", ")} — requires reconciliation` } });
    await audit({ organizationId: d.organizationId, action: "payments.verification_mismatch", targetType: "Donation", targetId: d.id, metadata: { fields: mismatch } });
    return "mismatch";
  }
  if (d.status === "SUCCEEDED" || !canTransition(d.status, "SUCCEEDED")) return "no_op";
  const fee = p.processingFee ?? null;
  const updated = await db.$transaction(async (tx) => {
    // Conditional update: only one concurrent processor wins the transition.
    const res = await tx.donation.updateMany({
      where: { id: d.id, status: d.status },
      data: {
        status: "SUCCEEDED",
        amountCharged: p.amount,
        processingFeeAmount: fee,
        netAmount: d.amount - (fee ?? 0) - d.platformFeeAmount,
        providerPaymentId: p.providerPaymentId ?? d.providerPaymentId,
        providerChargeId: p.providerChargeId ?? d.providerChargeId,
        paidAt: p.paidAt ?? new Date(),
        failureReason: null,
        receiptNumber: d.receiptNumber ?? receiptNumber(d),
      },
    });
    if (res.count !== 1) return false;
    await ledger(tx, d, "CHARGE", d.amount, sourceEventId, "Donation received (provider confirmed)");
    if (fee) await ledger(tx, d, "PROCESSING_FEE", -fee, sourceEventId, "Payment processing fee (reported by provider)");
    if (d.platformFeeAmount) await ledger(tx, d, "PLATFORM_FEE", -d.platformFeeAmount, sourceEventId, "Disclosed platform fee");
    return true;
  });
  if (!updated) return "no_op";
  await onDonationSucceeded(d.id).catch((e) => log.error("payments.post_success_failed", { donationId: d.id, ...errorMeta(e) }));
  return "processed";
}

async function markFailed(d: DonationWithConnection, p: VerifiedPayment): Promise<EventOutcome> {
  const to = p.status === "abandoned" ? "ABANDONED" : "FAILED";
  if (!canTransition(d.status, to) || d.status === "FAILED") return "no_op";
  if (d.status !== "PENDING" && to === "ABANDONED") return "no_op";
  await db.donation.updateMany({ where: { id: d.id, status: d.status }, data: { status: to, failureReason: p.failureReason ?? null } });
  return "processed";
}

async function applyRefund(d: DonationWithConnection, ev: Extract<NormalizedPaymentEvent, { kind: "refund.succeeded" | "refund.failed" }>): Promise<EventOutcome> {
  if (ev.currency.toUpperCase() !== d.currency) return "mismatch";
  const existing = await db.refund.findFirst({ where: { donationId: d.id, providerRefundId: ev.providerRefundId } });
  if (ev.kind === "refund.failed") {
    if (existing) await db.refund.update({ where: { id: existing.id }, data: { status: "FAILED" } });
    return "processed";
  }
  if (existing?.status === "SUCCEEDED") return "no_op";
  const remaining = d.amount - d.amountRefunded;
  const amount = Math.min(ev.amount, remaining);
  if (amount <= 0) return "no_op";
  await db.$transaction(async (tx) => {
    if (existing) await tx.refund.update({ where: { id: existing.id }, data: { status: "SUCCEEDED", amount } });
    else await tx.refund.create({ data: { organizationId: d.organizationId, donationId: d.id, amount, currency: d.currency, status: "SUCCEEDED", providerRefundId: ev.providerRefundId } });
    const refunded = d.amountRefunded + amount;
    await tx.donation.update({
      where: { id: d.id },
      data: {
        amountRefunded: refunded,
        status: refunded >= d.amount ? "REFUNDED" : "PARTIALLY_REFUNDED",
        netAmount: (d.netAmount ?? d.amount) - amount,
      },
    });
    await ledger(tx, d, "REFUND", -amount, `refund:${ev.providerRefundId}`, "Refund (provider confirmed)");
  });
  await audit({ organizationId: d.organizationId, action: "payments.refund_confirmed", targetType: "Donation", targetId: d.id, metadata: { amount } });
  return "processed";
}

async function applyDispute(d: DonationWithConnection, ev: Extract<NormalizedPaymentEvent, { kind: "dispute.opened" | "dispute.won" | "dispute.lost" }>): Promise<EventOutcome> {
  const dispute = await db.dispute.upsert({
    where: { providerDisputeId: ev.providerDisputeId },
    create: { organizationId: d.organizationId, donationId: d.id, providerDisputeId: ev.providerDisputeId, amount: ev.amount, currency: d.currency, reason: ev.reason ?? null },
    update: {},
  });
  await db.$transaction(async (tx) => {
    if (ev.kind === "dispute.opened") {
      if (canTransition(d.status, "DISPUTED")) await tx.donation.update({ where: { id: d.id }, data: { status: "DISPUTED" } });
      await ledger(tx, d, "DISPUTE_HOLD", -ev.amount, `dispute:${ev.providerDisputeId}:open`, "Funds held for dispute");
    } else if (ev.kind === "dispute.won") {
      await tx.dispute.update({ where: { id: dispute.id }, data: { status: "WON" } });
      if (d.status === "DISPUTED") await tx.donation.update({ where: { id: d.id }, data: { status: d.amountRefunded ? "PARTIALLY_REFUNDED" : "SUCCEEDED" } });
      await ledger(tx, d, "DISPUTE_RELEASE", ev.amount, `dispute:${ev.providerDisputeId}:won`, "Dispute won — funds released");
    } else {
      await tx.dispute.update({ where: { id: dispute.id }, data: { status: "LOST" } });
      await tx.donation.update({ where: { id: d.id }, data: { netAmount: (d.netAmount ?? d.amount) - ev.amount } });
      // The earlier hold already removed the funds; record the final loss for reporting (zero-sum against the hold).
      await ledger(tx, d, "DISPUTE_LOSS", 0, `dispute:${ev.providerDisputeId}:lost`, "Dispute lost");
    }
  });
  await audit({ organizationId: d.organizationId, action: `payments.${ev.kind.replace(".", "_")}`, targetType: "Donation", targetId: d.id });
  return "processed";
}

/**
 * Processes a verified provider event exactly once. Callers must have verified the signature
 * (provider.parseWebhook) or obtained the data from a server-to-server verification call.
 */
export async function processPaymentEvent(providerId: PaymentProviderId, ev: NormalizedPaymentEvent): Promise<EventOutcome> {
  const existing = await db.paymentWebhookEvent.findUnique({ where: { provider_eventId: { provider: providerId, eventId: ev.eventId } } });
  if (existing?.processedAt) return "duplicate";
  if (!existing) {
    try {
      await db.paymentWebhookEvent.create({ data: { provider: providerId, eventId: ev.eventId, type: ev.kind } });
    } catch {
      return "duplicate"; // concurrent delivery of the same event
    }
  }

  let outcome: EventOutcome = "ignored";
  switch (ev.kind) {
    case "payment.succeeded":
    case "payment.failed":
    case "payment.pending": {
      const d = await findDonation(providerId, ev.reference, ev.providerChargeId);
      if (!d) outcome = "not_found";
      else if (ev.kind === "payment.succeeded") {
        // Defence in depth: confirm with the provider's API before crediting, where supported.
        let confirmed: VerifiedPayment = ev;
        try {
          confirmed = await getPaymentProvider(providerId).verifyPayment({ reference: d.reference, providerPaymentId: d.providerPaymentId ?? ev.providerPaymentId, accountId: d.connection.providerAccountId! });
        } catch (e) {
          log.warn("payments.verify_call_failed", { donationId: d.id, ...errorMeta(e) });
        }
        outcome = confirmed.status === "succeeded" ? await markSucceeded(d, confirmed, ev.eventId) : "no_op";
      } else if (ev.kind === "payment.failed") outcome = await markFailed(d, ev);
      else outcome = "no_op";
      break;
    }
    case "refund.succeeded":
    case "refund.failed":
    case "dispute.opened":
    case "dispute.won":
    case "dispute.lost": {
      const d = await findDonation(providerId, ev.reference, ev.providerChargeId);
      if (!d) outcome = "not_found";
      else if (ev.accountId && ev.accountId !== d.connection.providerAccountId) outcome = "mismatch";
      else outcome = ev.kind.startsWith("refund") ? await applyRefund(d, ev as never) : await applyDispute(d, ev as never);
      break;
    }
    case "account.updated":
      await syncConnectionByAccount(providerId, ev.accountId);
      outcome = "processed";
      break;
    case "ignored":
      outcome = "ignored";
  }

  await db.paymentWebhookEvent.update({
    where: { provider_eventId: { provider: providerId, eventId: ev.eventId } },
    data: { processedAt: new Date(), outcome },
  });
  return outcome;
}

/**
 * Server-side reconciliation used by the donation result page and the finance dashboard.
 * It asks the provider directly; the browser's redirect is never treated as proof of payment.
 */
export async function reconcileDonation(reference: string): Promise<EventOutcome> {
  const d = await db.donation.findUnique({ where: { reference }, include: { connection: true } });
  if (!d || !d.connection.providerAccountId) return "not_found";
  if (d.status !== "PENDING" && d.status !== "ABANDONED") return "no_op";
  const provider = getPaymentProvider(d.provider);
  if (!provider.isAvailable()) return "no_op";
  const p = await provider.verifyPayment({ reference: d.reference, providerPaymentId: d.providerPaymentId, accountId: d.connection.providerAccountId });
  const eventId = `verify:${d.reference}:${p.status}`;
  if (p.status === "succeeded") return processPaymentEvent(d.provider, { ...p, eventId, kind: "payment.succeeded" });
  if (p.status === "failed") return processPaymentEvent(d.provider, { ...p, eventId, kind: "payment.failed" });
  return "no_op";
}

// Late-bound to avoid an import cycle (donations.ts imports this module).
async function onDonationSucceeded(donationId: string) {
  const { afterDonationSucceeded } = await import("./donations");
  await afterDonationSucceeded(donationId);
}
