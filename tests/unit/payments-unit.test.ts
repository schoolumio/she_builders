import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canTransition, deriveConnectionStatus } from "@/server/payments/status";
import { PaystackProvider } from "@/server/payments/providers/paystack";
import { WebhookSignatureError, type AccountSnapshot } from "@/server/payments/types";
import { paymentMatchesDonation } from "@/server/payments/events";
import { nextLifecycleState, } from "@/server/billing/service";
import { subscriptionGrantsPlan } from "@/server/billing/entitlements";

const snap = (o: Partial<AccountSnapshot>): AccountSnapshot => ({ providerAccountId: "a", providerStatus: "verified", currencies: [], chargesEnabled: true, payoutsEnabled: true, requirements: [], ...o });

describe("connection status", () => {
  it("requires provider confirmation before VERIFIED", () => {
    expect(deriveConnectionStatus(snap({ providerStatus: "pending" }), { requiresPlatformReview: false }, false)).toBe("PENDING_VERIFICATION");
    expect(deriveConnectionStatus(snap({ chargesEnabled: false }), { requiresPlatformReview: false }, false)).toBe("PENDING_VERIFICATION");
    expect(deriveConnectionStatus(snap({}), { requiresPlatformReview: false }, false)).toBe("VERIFIED");
  });
  it("requires platform review where the provider has no hosted KYC", () => {
    expect(deriveConnectionStatus(snap({}), { requiresPlatformReview: true }, false)).toBe("PENDING_VERIFICATION");
    expect(deriveConnectionStatus(snap({}), { requiresPlatformReview: true }, true)).toBe("VERIFIED");
  });
  it("maps restricted and onboarding states", () => {
    expect(deriveConnectionStatus(snap({ providerStatus: "restricted" }), { requiresPlatformReview: false }, true)).toBe("RESTRICTED");
    expect(deriveConnectionStatus(snap({ providerStatus: "onboarding_required" }), { requiresPlatformReview: false }, true)).toBe("ONBOARDING_REQUIRED");
  });
});

describe("donation state machine", () => {
  it("allows only safe transitions", () => {
    expect(canTransition("PENDING", "SUCCEEDED")).toBe(true);
    expect(canTransition("SUCCEEDED", "PENDING")).toBe(false);
    expect(canTransition("SUCCEEDED", "FAILED")).toBe(false);
    expect(canTransition("REFUNDED", "SUCCEEDED")).toBe(false);
    expect(canTransition("SUCCEEDED", "REFUNDED")).toBe(true);
  });
});

describe("payment verification against the server record", () => {
  const d = { amount: 500000, currency: "NGN", connection: { providerAccountId: "ACCT_ORG_A" } };
  const base = { status: "succeeded" as const, reference: "r", providerPaymentId: "p", providerChargeId: "c", processingFee: 0, paidAt: new Date() };
  it("flags amount, currency and recipient tampering", () => {
    expect(paymentMatchesDonation(d, { ...base, amount: 500000, currency: "NGN", accountId: "ACCT_ORG_A" })).toEqual([]);
    expect(paymentMatchesDonation(d, { ...base, amount: 100, currency: "NGN", accountId: "ACCT_ORG_A" })).toEqual(["amount"]);
    expect(paymentMatchesDonation(d, { ...base, amount: 500000, currency: "USD", accountId: "ACCT_ORG_A" })).toEqual(["currency"]);
    expect(paymentMatchesDonation(d, { ...base, amount: 500000, currency: "NGN", accountId: "ACCT_ORG_B" })).toEqual(["recipient"]);
  });
});

describe("Paystack webhooks", () => {
  const provider = new PaystackProvider();
  const body = JSON.stringify({ event: "charge.success", data: { id: 99, status: "success", reference: "don_ref", amount: 500000, currency: "NGN", fees: 7500, paid_at: "2026-10-01T10:00:00Z", subaccount: { subaccount_code: "ACCT_x" } } });
  const sign = (b: string, key = process.env.PAYSTACK_SECRET_KEY!) => createHmac("sha512", key).update(b).digest("hex");

  it("accepts a correctly signed event and normalises it", async () => {
    const ev = await provider.parseWebhook(body, new Headers({ "x-paystack-signature": sign(body) }));
    expect(ev.kind).toBe("payment.succeeded");
    if (ev.kind === "payment.succeeded") {
      expect(ev.eventId).toBe("charge.success:99");
      expect(ev.amount).toBe(500000);
      expect(ev.accountId).toBe("ACCT_x");
      expect(ev.processingFee).toBe(7500);
    }
  });

  it("rejects invalid or missing signatures", async () => {
    await expect(provider.parseWebhook(body, new Headers({ "x-paystack-signature": sign(body, "wrong") }))).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(provider.parseWebhook(body, new Headers())).rejects.toBeInstanceOf(WebhookSignatureError);
    const tampered = body.replace("500000", "1");
    await expect(provider.parseWebhook(tampered, new Headers({ "x-paystack-signature": sign(body) }))).rejects.toBeInstanceOf(WebhookSignatureError);
  });
});

describe("subscription lifecycle", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const plan = { code: "GROWTH", graceDays: 7 };
  const base = { providerSubscriptionId: null, trialEndsAt: null, graceEndsAt: null, cancelAtPeriodEnd: false, currentPeriodEnd: null };
  it("moves lapsed manual subscriptions into grace, then expiry", () => {
    const lapsed = nextLifecycleState({ ...base, status: "ACTIVE", currentPeriodEnd: new Date("2026-05-31T00:00:00Z") }, plan, now);
    expect(lapsed?.status).toBe("PAST_DUE");
    expect(lapsed?.graceEndsAt?.toISOString()).toBe("2026-06-07T00:00:00.000Z");
    expect(nextLifecycleState({ ...base, status: "PAST_DUE", graceEndsAt: new Date("2026-05-31T00:00:00Z") }, plan, now)?.status).toBe("EXPIRED");
  });
  it("expires cancelled subscriptions at period end and ignores provider-managed ones", () => {
    expect(nextLifecycleState({ ...base, status: "ACTIVE", cancelAtPeriodEnd: true, currentPeriodEnd: new Date("2026-05-31T00:00:00Z") }, plan, now)?.status).toBe("EXPIRED");
    expect(nextLifecycleState({ ...base, status: "ACTIVE", providerSubscriptionId: "sub_1", currentPeriodEnd: new Date("2026-05-01T00:00:00Z") }, plan, now)).toBeNull();
  });
  it("grants the plan only while active, trialing or within grace", () => {
    expect(subscriptionGrantsPlan({ status: "PAST_DUE", graceEndsAt: new Date("2026-06-05T00:00:00Z"), trialEndsAt: null, currentPeriodEnd: null }, now)).toBe(true);
    expect(subscriptionGrantsPlan({ status: "PAST_DUE", graceEndsAt: new Date("2026-05-05T00:00:00Z"), trialEndsAt: null, currentPeriodEnd: null }, now)).toBe(false);
    expect(subscriptionGrantsPlan({ status: "EXPIRED", graceEndsAt: null, trialEndsAt: null, currentPeriodEnd: null }, now)).toBe(false);
    expect(subscriptionGrantsPlan({ status: "TRIALING", graceEndsAt: null, trialEndsAt: new Date("2026-05-30T00:00:00Z"), currentPeriodEnd: null }, now)).toBe(false);
  });
});
