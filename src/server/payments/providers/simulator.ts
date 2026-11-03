import "server-only";
import { db } from "../../db";
import { env } from "../../env";
import { hmacSha256, randomToken, safeEqual } from "../../crypto";
import type { AccountSnapshot, CheckoutParams, NormalizedPaymentEvent, PaymentProvider, ProviderSettlement, RecurringCheckoutParams, VerifiedPayment } from "../types";
import { ProviderError, WebhookSignatureError } from "../types";

type SimAccount = { status: AccountSnapshot["providerStatus"]; country: string; currencies: string[] };
type SimPayment = {
  reference: string;
  status: VerifiedPayment["status"];
  amount: number;
  currency: string;
  accountId: string;
  platformFee: number;
  chargeId: string;
  paidAt?: string;
  refunded: number;
};

type SimSubscription = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  accountId: string;
  interval: "WEEKLY" | "MONTHLY";
  status: "pending" | "active" | "canceled";
  charges: number;
};

type SimPayout = ProviderSettlement & { accountId: string; createdAt: string };

type SimWebhookBody = {
  type: string;
  payment?: SimPayment;
  refund?: { id: string; amount: number };
  dispute?: { id: string; amount: number; outcome?: string };
  subscription?: SimSubscription;
  charge?: { id: string; amount: number; currency: string; paidAt: string };
  reason?: string;
  payout?: SimPayout;
};

export const SIMULATOR_SIGNATURE_HEADER = "x-simulator-signature";

function secret() {
  return process.env.PAYMENTS_SIMULATOR_SECRET || "test-simulator-secret";
}

export function simulatorAllowed() {
  if (env.appEnv === "test") return true;
  if (env.isProduction) return false;
  return process.env.PAYMENTS_SIMULATOR_ENABLED === "true";
}

/** Simulated 1.5% processing fee (capped), purely illustrative. */
export function simulatedFee(amount: number) {
  return Math.min(Math.round(amount * 0.015), 200_000);
}

export function signSimulatorBody(body: string) {
  return hmacSha256(secret(), body);
}

async function getRecord<T>(key: string): Promise<T | null> {
  const r = await db.simulatorRecord.findUnique({ where: { key } });
  return (r?.data as T | undefined) ?? null;
}

async function putRecord(key: string, data: object) {
  await db.simulatorRecord.upsert({ where: { key }, create: { key, data }, update: { data } });
}

/**
 * Local payment simulator for development, demos and automated tests. It mimics a provider with
 * hosted onboarding, hosted checkout and signed webhooks, so the full donation flow (including
 * signature verification and idempotency) can be exercised without real money. It is refused when
 * APP_ENV=production.
 */
export class SimulatorProvider implements PaymentProvider {
  readonly id = "SIMULATOR" as const;
  readonly displayName = "Payment simulator (test only)";
  readonly capabilities = { hostedOnboarding: true, bankDetailsForm: false, requiresPlatformReview: false, refunds: true, disputes: true, recurring: true, settlements: true };

  isAvailable() {
    return simulatorAllowed();
  }

  isTestMode() {
    return true;
  }

  supportedCurrencies() {
    return ["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR", "CAD"];
  }

  private guard() {
    if (!this.isAvailable()) throw new ProviderError("Simulator disabled", "The payment simulator is not available in this environment.");
  }

  async startOnboarding(input: { existingAccountId?: string | null; country: string; returnUrl: string }) {
    this.guard();
    const id = input.existingAccountId ?? `sim_acct_${randomToken(8)}`;
    if (!(await getRecord<SimAccount>(`account:${id}`))) {
      await putRecord(`account:${id}`, { status: "onboarding_required", country: input.country, currencies: this.supportedCurrencies() } satisfies SimAccount);
    }
    return { snapshot: await this.syncAccount(id), redirectUrl: `${env.appUrl}/simulator/onboarding/${id}?return=${encodeURIComponent(input.returnUrl)}` };
  }

  /** Called by the simulator's hosted onboarding page (stands in for the provider's KYC decision). */
  async setAccountStatus(accountId: string, status: SimAccount["status"]) {
    this.guard();
    const acct = await getRecord<SimAccount>(`account:${accountId}`);
    if (!acct) throw new ProviderError("Unknown simulator account");
    await putRecord(`account:${accountId}`, { ...acct, status });
  }

  async syncAccount(accountId: string): Promise<AccountSnapshot> {
    this.guard();
    const acct = await getRecord<SimAccount>(`account:${accountId}`);
    if (!acct) throw new ProviderError("Unknown simulator account");
    const verified = acct.status === "verified";
    return {
      providerAccountId: accountId,
      providerStatus: acct.status,
      accountName: "Simulated Organisation Account",
      bankName: "Simulator Bank",
      accountLast4: "0000",
      country: acct.country,
      currencies: acct.currencies,
      chargesEnabled: verified,
      payoutsEnabled: verified,
      requirements: acct.status === "onboarding_required" ? ["business_details", "settlement_account"] : [],
    };
  }

  async createCheckout(p: CheckoutParams) {
    this.guard();
    await putRecord(`payment:${p.reference}`, {
      reference: p.reference,
      status: "pending",
      amount: p.amount,
      currency: p.currency,
      accountId: p.accountId,
      platformFee: p.platformFee,
      chargeId: `sim_ch_${randomToken(8)}`,
      refunded: 0,
    } satisfies SimPayment);
    const url = new URL(`${env.appUrl}/simulator/checkout/${p.reference}`);
    url.searchParams.set("return", p.successUrl);
    url.searchParams.set("cancel", p.cancelUrl);
    return { checkoutUrl: url.toString(), providerPaymentId: `sim_pay_${p.reference}` };
  }

  /** Simulates the donor completing (or failing) the hosted payment. Returns the signed webhook to deliver. */
  async completeCheckout(reference: string, outcome: "succeeded" | "failed" | "pending") {
    this.guard();
    const pay = await getRecord<SimPayment>(`payment:${reference}`);
    if (!pay) throw new ProviderError("Unknown simulator payment");
    if (pay.status === "pending") {
      await putRecord(`payment:${reference}`, { ...pay, status: outcome, paidAt: outcome === "succeeded" ? new Date().toISOString() : undefined });
    }
    const updated = (await getRecord<SimPayment>(`payment:${reference}`))!;
    return this.buildWebhook({ type: outcome === "succeeded" ? "payment.succeeded" : outcome === "failed" ? "payment.failed" : "payment.pending", payment: updated });
  }

  // ----- Recurring (simulated provider-held subscription) -----

  async createRecurringCheckout(p: RecurringCheckoutParams) {
    this.guard();
    const sub: SimSubscription = { id: `sim_sub_${randomToken(10)}`, reference: p.reference, amount: p.amount, currency: p.currency, accountId: p.accountId, interval: p.interval, status: "pending", charges: 0 };
    await putRecord(`subscription:${sub.id}`, sub);
    await putRecord(`subscription-ref:${p.reference}`, { id: sub.id });
    const url = new URL(`${env.appUrl}/simulator/subscribe/${p.reference}`);
    url.searchParams.set("return", p.successUrl);
    url.searchParams.set("cancel", p.cancelUrl);
    return { checkoutUrl: url.toString(), providerCheckoutId: `sim_cs_${p.reference}` };
  }

  async subscriptionByReference(reference: string) {
    const ref = await getRecord<{ id: string }>(`subscription-ref:${reference}`);
    return ref ? getRecord<SimSubscription>(`subscription:${ref.id}`) : null;
  }

  /** Donor completes the simulated checkout: subscription becomes active and the first charge is taken. */
  async activateSubscription(reference: string) {
    this.guard();
    const sub = await this.subscriptionByReference(reference);
    if (!sub) throw new ProviderError("Unknown simulator subscription");
    if (sub.status === "pending") await putRecord(`subscription:${sub.id}`, { ...sub, status: "active" });
    const active = (await getRecord<SimSubscription>(`subscription:${sub.id}`))!;
    return [this.buildWebhook({ type: "recurring.activated", subscription: active }), await this.chargeSubscription(active.id, "succeeded")];
  }

  /** Simulates the provider charging a subscription (the next period). */
  async chargeSubscription(subscriptionId: string, outcome: "succeeded" | "failed") {
    this.guard();
    const sub = await getRecord<SimSubscription>(`subscription:${subscriptionId}`);
    if (!sub || sub.status !== "active") throw new ProviderError("Subscription is not active");
    if (outcome === "failed") return this.buildWebhook({ type: "recurring.charge_failed", subscription: sub, reason: "Simulated card decline" });
    await putRecord(`subscription:${sub.id}`, { ...sub, charges: sub.charges + 1 });
    const charge = { id: `sim_in_${randomToken(10)}`, amount: sub.amount, currency: sub.currency, paidAt: new Date().toISOString() };
    return this.buildWebhook({ type: "recurring.charge_succeeded", subscription: sub, charge });
  }

  async cancelRecurring(input: { providerSubscriptionId: string }) {
    this.guard();
    const sub = await getRecord<SimSubscription>(`subscription:${input.providerSubscriptionId}`);
    if (!sub) throw new ProviderError("Unknown simulator subscription");
    await putRecord(`subscription:${sub.id}`, { ...sub, status: "canceled" });
  }

  /** Simulates the provider cancelling on its own (e.g. after repeated failures). */
  async cancelAtProvider(subscriptionId: string) {
    await this.cancelRecurring({ providerSubscriptionId: subscriptionId });
    return this.buildWebhook({ type: "recurring.canceled", subscription: (await getRecord<SimSubscription>(`subscription:${subscriptionId}`))! });
  }

  // ----- Payouts -----

  async createPayout(accountId: string, amount: number, currency: string, status: "pending" | "paid" | "failed") {
    this.guard();
    const now = new Date();
    const payout: SimPayout = {
      providerSettlementId: `sim_po_${randomToken(10)}`,
      amount,
      feeAmount: 0,
      currency,
      status,
      providerStatus: status,
      expectedAt: new Date(now.getTime() + 2 * 86400_000),
      settledAt: status === "paid" ? now : null,
      accountId,
      createdAt: now.toISOString(),
    };
    await putRecord(`payout:${payout.providerSettlementId}`, payout);
    return payout;
  }

  async setPayoutStatus(payoutId: string, status: "pending" | "paid" | "failed") {
    this.guard();
    const p = await getRecord<SimPayout>(`payout:${payoutId}`);
    if (!p) throw new ProviderError("Unknown payout");
    const updated = { ...p, status, providerStatus: status, settledAt: status === "paid" ? new Date() : null };
    await putRecord(`payout:${payoutId}`, updated);
    return this.buildWebhook({ type: "settlement.updated", payout: updated });
  }

  async listSettlements(input: { accountId: string; since: Date }): Promise<ProviderSettlement[]> {
    this.guard();
    const rows = await db.simulatorRecord.findMany({ where: { key: { startsWith: "payout:" } } });
    return rows
      .map((r) => r.data as unknown as SimPayout)
      .filter((p) => p.accountId === input.accountId && new Date(p.createdAt) >= input.since)
      .map((p) => ({
        providerSettlementId: p.providerSettlementId,
        amount: p.amount,
        feeAmount: p.feeAmount,
        currency: p.currency,
        status: p.status,
        providerStatus: p.providerStatus,
        expectedAt: p.expectedAt ? new Date(p.expectedAt) : null,
        settledAt: p.settledAt ? new Date(p.settledAt) : null,
      }));
  }

  buildWebhook(body: SimWebhookBody) {
    const raw = JSON.stringify({ id: `evt_${randomToken(10)}`, ...body });
    return { raw, signature: signSimulatorBody(raw) };
  }

  private toVerified(pay: SimPayment): VerifiedPayment {
    return {
      status: pay.status,
      reference: pay.reference,
      providerPaymentId: `sim_pay_${pay.reference}`,
      providerChargeId: pay.chargeId,
      amount: pay.amount,
      currency: pay.currency,
      accountId: pay.accountId,
      processingFee: pay.status === "succeeded" ? simulatedFee(pay.amount) : null,
      paidAt: pay.paidAt ? new Date(pay.paidAt) : null,
      failureReason: pay.status === "failed" ? "Simulated card decline" : null,
    };
  }

  async verifyPayment(input: { reference: string }) {
    this.guard();
    const pay = await getRecord<SimPayment>(`payment:${input.reference}`);
    if (!pay) throw new ProviderError("Unknown simulator payment");
    return this.toVerified(pay);
  }

  async refund(input: { reference: string; amount: number }) {
    this.guard();
    const pay = await getRecord<SimPayment>(`payment:${input.reference}`);
    if (!pay || pay.status !== "succeeded") throw new ProviderError("Payment not refundable", "This payment cannot be refunded.");
    if (pay.refunded + input.amount > pay.amount) throw new ProviderError("Refund exceeds amount", "Refund exceeds the amount paid.");
    await putRecord(`payment:${input.reference}`, { ...pay, refunded: pay.refunded + input.amount });
    return { providerRefundId: `sim_re_${randomToken(8)}`, status: "succeeded" as const };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<NormalizedPaymentEvent> {
    const sig = headers.get(SIMULATOR_SIGNATURE_HEADER) ?? "";
    if (!sig || !safeEqual(signSimulatorBody(rawBody), sig)) throw new WebhookSignatureError();
    const body = JSON.parse(rawBody) as SimWebhookBody & { id: string };
    const p = body.payment;
    const sub = body.subscription;
    switch (body.type) {
      case "recurring.activated":
        if (!sub) break;
        return { eventId: body.id, kind: "recurring.activated", reference: sub.reference, providerCheckoutId: `sim_cs_${sub.reference}`, providerSubscriptionId: sub.id, accountId: sub.accountId, nextChargeAt: null };
      case "recurring.charge_succeeded":
        if (!sub || !body.charge) break;
        return {
          eventId: body.id,
          kind: "recurring.charge_succeeded",
          providerSubscriptionId: sub.id,
          status: "succeeded",
          reference: "",
          providerPaymentId: body.charge.id,
          providerChargeId: body.charge.id,
          amount: body.charge.amount,
          currency: body.charge.currency,
          accountId: sub.accountId,
          processingFee: simulatedFee(body.charge.amount),
          paidAt: new Date(body.charge.paidAt),
        };
      case "recurring.charge_failed":
        if (!sub) break;
        return { eventId: body.id, kind: "recurring.charge_failed", providerSubscriptionId: sub.id, accountId: sub.accountId, reason: body.reason ?? null };
      case "recurring.canceled":
        if (!sub) break;
        return { eventId: body.id, kind: "recurring.canceled", providerSubscriptionId: sub.id, accountId: sub.accountId };
      case "settlement.updated": {
        const po = body.payout;
        if (!po) break;
        return {
          eventId: body.id,
          kind: "settlement.updated",
          accountId: po.accountId,
          settlement: { ...po, expectedAt: po.expectedAt ? new Date(po.expectedAt) : null, settledAt: po.settledAt ? new Date(po.settledAt) : null },
        };
      }
      case "payment.succeeded":
      case "payment.failed":
      case "payment.pending":
        if (!p) break;
        return { eventId: body.id, kind: body.type, ...this.toVerified(p) };
      case "refund.succeeded":
        if (!p || !body.refund) break;
        return { eventId: body.id, kind: "refund.succeeded", reference: p.reference, providerChargeId: p.chargeId, providerRefundId: body.refund.id, amount: body.refund.amount, currency: p.currency, accountId: p.accountId };
      case "dispute.opened":
      case "dispute.won":
      case "dispute.lost":
        if (!p || !body.dispute) break;
        return { eventId: body.id, kind: body.type, reference: p.reference, providerChargeId: p.chargeId, providerDisputeId: body.dispute.id, amount: body.dispute.amount, currency: p.currency, reason: "simulated", accountId: p.accountId };
    }
    return { eventId: body.id, kind: "ignored", providerType: body.type };
  }
}
