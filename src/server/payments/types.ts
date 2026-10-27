import type { PaymentProviderId } from "@prisma/client";

export type ProviderAccountStatus = "onboarding_required" | "pending" | "verified" | "restricted";

/** Normalised view of a connected/recipient account, always sourced from the provider. */
export type AccountSnapshot = {
  providerAccountId: string;
  providerStatus: ProviderAccountStatus;
  accountName?: string | null;
  bankName?: string | null;
  accountLast4?: string | null;
  country?: string | null;
  currencies: string[];
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirements: string[];
};

export type BankDetails = { bankCode: string; accountNumber: string; businessName: string; contactEmail?: string };

export type OnboardingResult = { snapshot: AccountSnapshot; redirectUrl?: string };

export type CheckoutParams = {
  reference: string;
  amount: number; // minor units, already validated server-side
  currency: string;
  platformFee: number; // minor units, disclosed to the donor
  accountId: string; // recipient account from the server-side connection record
  donorEmail: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
};

export type VerifiedPayment = {
  status: "succeeded" | "failed" | "pending" | "abandoned";
  reference: string;
  providerPaymentId: string | null; // checkout/session/transaction id
  providerChargeId: string | null; // underlying charge id (Stripe PaymentIntent, Paystack transaction)
  amount: number | null;
  currency: string | null;
  accountId: string | null;
  processingFee: number | null;
  paidAt: Date | null;
  failureReason?: string | null;
};

export type NormalizedPaymentEvent =
  | ({ eventId: string; kind: "payment.succeeded" | "payment.failed" | "payment.pending" } & VerifiedPayment)
  | { eventId: string; kind: "refund.succeeded" | "refund.failed"; reference: string | null; providerChargeId: string | null; providerRefundId: string; amount: number; currency: string; accountId: string | null }
  | { eventId: string; kind: "dispute.opened" | "dispute.won" | "dispute.lost"; reference: string | null; providerChargeId: string | null; providerDisputeId: string; amount: number; currency: string; reason?: string | null; accountId: string | null }
  | { eventId: string; kind: "account.updated"; accountId: string }
  | { eventId: string; kind: "ignored"; providerType: string };

export type ProviderCapabilities = {
  hostedOnboarding: boolean; // provider collects KYC/bank details on its own pages
  bankDetailsForm: boolean; // we pass bank details to the provider API (never stored in full)
  requiresPlatformReview: boolean; // BridgeCodes must review the organisation before VERIFIED
  refunds: boolean;
  disputes: boolean;
  recurring: boolean;
};

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  /** True when credentials are present (and, for the simulator, when allowed in this environment). */
  isAvailable(): boolean;
  isTestMode(): boolean;
  supportedCurrencies(country?: string): string[];
  listBanks?(country: string): Promise<{ code: string; name: string }[]>;
  startOnboarding(input: {
    existingAccountId?: string | null;
    organizationId: string;
    country: string;
    email?: string | null;
    returnUrl: string;
    refreshUrl: string;
    bankDetails?: BankDetails;
  }): Promise<OnboardingResult>;
  syncAccount(accountId: string): Promise<AccountSnapshot>;
  createCheckout(params: CheckoutParams): Promise<{ checkoutUrl: string; providerPaymentId?: string }>;
  verifyPayment(input: { reference: string; providerPaymentId?: string | null; accountId: string }): Promise<VerifiedPayment>;
  refund(input: { reference: string; providerPaymentId: string; amount: number; accountId: string }): Promise<{ providerRefundId: string; status: "pending" | "succeeded" | "failed" }>;
  /** Verifies the webhook signature against the raw body. Throws WebhookSignatureError when invalid. */
  parseWebhook(rawBody: string, headers: Headers): Promise<NormalizedPaymentEvent>;
}

export class WebhookSignatureError extends Error {
  constructor(message = "Invalid webhook signature") {
    super(message);
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly userMessage = "The payment provider could not complete this request. Please try again later.",
  ) {
    super(message);
  }
}
