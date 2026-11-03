import "server-only";
import { createHmac } from "node:crypto";
import { safeEqual } from "../../crypto";
import type { AccountSnapshot, BankDetails, CheckoutParams, NormalizedPaymentEvent, PaymentProvider, ProviderSettlement, VerifiedPayment } from "../types";
import { ProviderError, WebhookSignatureError } from "../types";

const API = "https://api.paystack.co";

const COUNTRY_CURRENCIES: Record<string, string[]> = {
  NG: ["NGN", "USD"],
  GH: ["GHS", "USD"],
  KE: ["KES", "USD"],
  ZA: ["ZAR"],
  CI: ["XOF"],
};
const COUNTRY_NAMES: Record<string, string> = { NG: "nigeria", GH: "ghana", KE: "kenya", ZA: "south africa", CI: "côte d'ivoire" };

type PaystackResponse<T> = { status: boolean; message: string; data: T };

/**
 * Paystack adapter.
 *
 * Model: each organisation gets a Paystack **subaccount** created under the BridgeCodes Paystack
 * integration (Paystack "Split Payments"). Paystack settles the subaccount's share directly to the
 * organisation's bank account; BridgeCodes never receives the donation funds. The subaccount is
 * created with `percentage_charge: 0`; any disclosed platform fee is passed per transaction as a
 * flat `transaction_charge`, and the subaccount bears Paystack's processing fee (`bearer: subaccount`).
 *
 * Paystack has no hosted KYC for subaccounts, so the organisation's settlement account is resolved
 * through Paystack's account-resolution API and BridgeCodes performs a manual organisation review
 * before the connection becomes VERIFIED (`requiresPlatformReview`).
 *
 * Commercial note: the BridgeCodes Paystack business must be approved by Paystack for split
 * payments on behalf of third-party organisations before live keys are used. See docs/PAYMENTS.md.
 */
export class PaystackProvider implements PaymentProvider {
  readonly id = "PAYSTACK" as const;
  readonly displayName = "Paystack";
  readonly capabilities = { hostedOnboarding: false, bankDetailsForm: true, requiresPlatformReview: true, refunds: true, disputes: true, recurring: false, settlements: true };

  private get secret() {
    return process.env.PAYSTACK_SECRET_KEY ?? "";
  }

  isAvailable() {
    return !!this.secret;
  }

  isTestMode() {
    return this.secret.startsWith("sk_test_");
  }

  supportedCurrencies(country?: string) {
    return country ? (COUNTRY_CURRENCIES[country] ?? []) : [...new Set(Object.values(COUNTRY_CURRENCIES).flat())];
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    if (!this.isAvailable()) throw new ProviderError("Paystack is not configured", "Paystack is not configured on this platform.");
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as PaystackResponse<T> | null;
    if (!res.ok || !json?.status) {
      throw new ProviderError(`Paystack ${method} ${path} failed: ${res.status} ${json?.message ?? ""}`, json?.message ? `Paystack: ${json.message}` : undefined);
    }
    return json.data;
  }

  async listBanks(country: string) {
    const name = COUNTRY_NAMES[country];
    if (!name) return [];
    const banks = await this.call<{ name: string; code: string; active: boolean }[]>("GET", `/bank?country=${encodeURIComponent(name)}&perPage=200`);
    return banks.filter((b) => b.active).map((b) => ({ code: b.code, name: b.name }));
  }

  async startOnboarding(input: { country: string; email?: string | null; bankDetails?: BankDetails }) {
    const bank = input.bankDetails;
    if (!bank) throw new ProviderError("Bank details required", "Enter the organisation's settlement bank details.");
    if (!/^\d{10}$/.test(bank.accountNumber) && input.country === "NG") {
      throw new ProviderError("Invalid NUBAN", "Nigerian account numbers have 10 digits.");
    }
    // 1. Resolve the account so Paystack confirms the account exists and returns its registered name.
    const resolved = await this.call<{ account_number: string; account_name: string }>(
      "GET",
      `/bank/resolve?account_number=${encodeURIComponent(bank.accountNumber)}&bank_code=${encodeURIComponent(bank.bankCode)}`,
    );
    // 2. Create the subaccount. The full account number goes only to Paystack.
    const sub = await this.call<{ subaccount_code: string }>("POST", "/subaccount", {
      business_name: bank.businessName,
      settlement_bank: bank.bankCode,
      account_number: bank.accountNumber,
      percentage_charge: 0,
      primary_contact_email: bank.contactEmail ?? input.email ?? undefined,
      description: "AltarCall organisation",
    });
    const snapshot = await this.syncAccount(sub.subaccount_code);
    return { snapshot: { ...snapshot, accountName: resolved.account_name } };
  }

  async syncAccount(accountId: string): Promise<AccountSnapshot> {
    const s = await this.call<{
      subaccount_code: string;
      business_name: string;
      account_number: string;
      settlement_bank: string;
      currency: string;
      active: boolean;
      is_verified?: boolean;
      account_name?: string;
    }>("GET", `/subaccount/${encodeURIComponent(accountId)}`);
    const country = Object.entries(COUNTRY_CURRENCIES).find(([, c]) => c[0] === s.currency)?.[0] ?? null;
    return {
      providerAccountId: s.subaccount_code,
      providerStatus: s.active ? "verified" : "restricted",
      accountName: s.account_name ?? s.business_name,
      bankName: s.settlement_bank,
      accountLast4: s.account_number?.slice(-4) ?? null,
      country,
      currencies: [s.currency],
      chargesEnabled: s.active,
      payoutsEnabled: s.active,
      requirements: [],
    };
  }

  async createCheckout(p: CheckoutParams) {
    const data = await this.call<{ authorization_url: string; reference: string }>("POST", "/transaction/initialize", {
      email: p.donorEmail,
      amount: p.amount,
      currency: p.currency,
      reference: p.reference,
      callback_url: p.successUrl,
      subaccount: p.accountId,
      transaction_charge: p.platformFee,
      bearer: "subaccount",
      metadata: { ...p.metadata, cancel_action: p.cancelUrl },
    });
    return { checkoutUrl: data.authorization_url };
  }

  private normaliseTx(t: {
    id: number;
    status: string;
    reference: string;
    amount: number;
    currency: string;
    fees?: number | null;
    paid_at?: string | null;
    gateway_response?: string | null;
    subaccount?: { subaccount_code?: string } | null;
  }): VerifiedPayment {
    const status = t.status === "success" ? "succeeded" : t.status === "failed" || t.status === "reversed" ? "failed" : t.status === "abandoned" ? "abandoned" : "pending";
    return {
      status,
      reference: t.reference,
      providerPaymentId: String(t.id),
      providerChargeId: String(t.id),
      amount: t.amount,
      currency: t.currency,
      accountId: t.subaccount?.subaccount_code ?? null,
      processingFee: typeof t.fees === "number" ? t.fees : null,
      paidAt: t.paid_at ? new Date(t.paid_at) : null,
      failureReason: status === "failed" ? (t.gateway_response ?? "Payment failed") : null,
    };
  }

  async verifyPayment(input: { reference: string }) {
    const t = await this.call<Parameters<PaystackProvider["normaliseTx"]>[0]>("GET", `/transaction/verify/${encodeURIComponent(input.reference)}`);
    return this.normaliseTx(t);
  }

  async refund(input: { reference: string; amount: number }) {
    const r = await this.call<{ id: number; status: string }>("POST", "/refund", { transaction: input.reference, amount: input.amount });
    return { providerRefundId: String(r.id), status: r.status === "processed" ? ("succeeded" as const) : ("pending" as const) };
  }

  /**
   * Settlements to the organisation's subaccount (GET /settlement?subaccount=…).
   * The amount paid to the bank is `effective_amount` (after fees) when present, else `total_amount`.
   * Verify this mapping against Paystack test data before relying on it for reconciliation.
   */
  async listSettlements(input: { accountId: string; since: Date }): Promise<ProviderSettlement[]> {
    const rows = await this.call<
      { id: number; status: string; currency: string; total_amount?: number; effective_amount?: number; total_fees?: number; settlement_date?: string | null; createdAt?: string }[]
    >("GET", `/settlement?subaccount=${encodeURIComponent(input.accountId)}&from=${encodeURIComponent(input.since.toISOString())}&perPage=100`);
    return rows.map((r) => {
      const st = r.status?.toLowerCase();
      const status = st === "success" || st === "settled" ? "paid" : st === "failed" ? "failed" : "pending";
      const date = r.settlement_date ? new Date(r.settlement_date) : null;
      return {
        providerSettlementId: String(r.id),
        amount: r.effective_amount ?? r.total_amount ?? 0,
        feeAmount: typeof r.total_fees === "number" ? r.total_fees : null,
        currency: (r.currency ?? "NGN").toUpperCase(),
        status,
        providerStatus: r.status,
        expectedAt: date,
        settledAt: status === "paid" ? date : null,
      } satisfies ProviderSettlement;
    });
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<NormalizedPaymentEvent> {
    const signature = headers.get("x-paystack-signature") ?? "";
    if (!this.secret) throw new WebhookSignatureError("Paystack not configured");
    const expected = createHmac("sha512", this.secret).update(rawBody).digest("hex");
    if (!signature || !safeEqual(expected, signature)) throw new WebhookSignatureError();
    return normalisePaystackEvent(JSON.parse(rawBody), (t) => this.normaliseTx(t));
  }
}

type PaystackEvent = { event: string; data: Record<string, unknown> & { id?: number | string } };

/** Paystack events carry no event id, so `${event}:${data.id}` is the idempotency key. */
export function normalisePaystackEvent(
  body: PaystackEvent,
  normaliseTx: (t: Parameters<PaystackProvider["normaliseTx"]>[0]) => VerifiedPayment,
): NormalizedPaymentEvent {
  const d = body.data ?? {};
  const eventId = `${body.event}:${String(d.id ?? d.reference ?? "unknown")}`;
  switch (body.event) {
    case "charge.success": {
      const tx = normaliseTx(d as never);
      return { eventId, kind: tx.status === "succeeded" ? "payment.succeeded" : "payment.pending", ...tx };
    }
    case "charge.failed": {
      const tx = normaliseTx(d as never);
      return { eventId, kind: "payment.failed", ...tx, status: "failed" };
    }
    case "refund.processed":
    case "refund.failed": {
      const r = d as { id: number; amount: number; currency: string; transaction_reference?: string; transaction?: { reference?: string; id?: number } };
      return {
        eventId,
        kind: body.event === "refund.processed" ? "refund.succeeded" : "refund.failed",
        reference: r.transaction_reference ?? r.transaction?.reference ?? null,
        providerChargeId: r.transaction?.id ? String(r.transaction.id) : null,
        providerRefundId: String(r.id),
        amount: r.amount,
        currency: r.currency,
        accountId: null,
      };
    }
    case "charge.dispute.create":
    case "charge.dispute.resolve": {
      const x = d as { id: number; refund_amount?: number; currency: string; status?: string; category?: string; resolution?: string; transaction?: { reference?: string; id?: number; amount?: number } };
      const resolved = body.event === "charge.dispute.resolve";
      // "declined" = the customer's claim was rejected (merchant wins); "merchant-accepted" = refund the customer.
      const won = resolved && x.resolution === "declined";
      return {
        eventId,
        kind: !resolved ? "dispute.opened" : won ? "dispute.won" : "dispute.lost",
        reference: x.transaction?.reference ?? null,
        providerChargeId: x.transaction?.id ? String(x.transaction.id) : null,
        providerDisputeId: String(x.id),
        amount: x.refund_amount ?? x.transaction?.amount ?? 0,
        currency: x.currency,
        reason: x.category ?? null,
        accountId: null,
      };
    }
    default:
      return { eventId, kind: "ignored", providerType: body.event };
  }
}
