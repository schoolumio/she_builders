import "server-only";
import { db } from "../../db";
import { env } from "../../env";
import { hmacSha256, randomToken, safeEqual } from "../../crypto";
import type { AccountSnapshot, CheckoutParams, NormalizedPaymentEvent, PaymentProvider, VerifiedPayment } from "../types";
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
  readonly capabilities = { hostedOnboarding: true, bankDetailsForm: false, requiresPlatformReview: false, refunds: true, disputes: true, recurring: false };

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

  buildWebhook(body: { type: string; payment?: SimPayment; refund?: { id: string; amount: number }; dispute?: { id: string; amount: number; outcome?: string } }) {
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
    const body = JSON.parse(rawBody) as { id: string; type: string; payment?: SimPayment; refund?: { id: string; amount: number }; dispute?: { id: string; amount: number; outcome?: string } };
    const p = body.payment;
    switch (body.type) {
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
