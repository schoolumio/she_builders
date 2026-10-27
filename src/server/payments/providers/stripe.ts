import "server-only";
import Stripe from "stripe";
import type { AccountSnapshot, CheckoutParams, NormalizedPaymentEvent, PaymentProvider, VerifiedPayment } from "../types";
import { ProviderError, WebhookSignatureError } from "../types";

/**
 * Stripe Connect adapter using **Standard connected accounts and direct charges**.
 *
 * The organisation onboards on Stripe-hosted pages (Stripe collects identity, business and bank
 * details) and becomes the merchant of record: funds settle to the organisation's own Stripe
 * balance and bank account, never to BridgeCodes. A disclosed platform fee, if any, is taken as
 * `application_fee_amount`. Refunds and disputes are handled on the organisation's account.
 */
export class StripeConnectProvider implements PaymentProvider {
  readonly id = "STRIPE" as const;
  readonly displayName = "Stripe";
  readonly capabilities = { hostedOnboarding: true, bankDetailsForm: false, requiresPlatformReview: false, refunds: true, disputes: true, recurring: false };
  private client?: Stripe;

  private get key() {
    return process.env.STRIPE_SECRET_KEY ?? "";
  }

  isAvailable() {
    return !!this.key;
  }

  isTestMode() {
    return this.key.startsWith("sk_test_") || this.key.startsWith("rk_test_");
  }

  supportedCurrencies() {
    return ["USD", "GBP", "EUR", "CAD", "AUD", "NZD", "CHF", "SEK", "NOK", "DKK", "SGD", "HKD", "JPY", "ZAR", "NGN", "KES", "GHS"];
  }

  private stripe() {
    if (!this.isAvailable()) throw new ProviderError("Stripe is not configured", "Stripe is not configured on this platform.");
    this.client ??= new Stripe(this.key, { appInfo: { name: "Prayer Community Platform" } });
    return this.client;
  }

  async startOnboarding(input: { existingAccountId?: string | null; organizationId: string; country: string; email?: string | null; returnUrl: string; refreshUrl: string }) {
    const stripe = this.stripe();
    let accountId = input.existingAccountId ?? null;
    try {
      if (!accountId) {
        const account = await stripe.accounts.create({
          type: "standard",
          country: input.country,
          email: input.email ?? undefined,
          metadata: { organizationId: input.organizationId },
        });
        accountId = account.id;
      }
      const link = await stripe.accountLinks.create({ account: accountId, type: "account_onboarding", return_url: input.returnUrl, refresh_url: input.refreshUrl });
      return { snapshot: await this.syncAccount(accountId), redirectUrl: link.url };
    } catch (e) {
      throw toProviderError(e);
    }
  }

  async syncAccount(accountId: string): Promise<AccountSnapshot> {
    let a: Stripe.Account;
    try {
      a = await this.stripe().accounts.retrieve(accountId);
    } catch (e) {
      throw toProviderError(e);
    }
    return snapshotFromAccount(a);
  }

  async createCheckout(p: CheckoutParams) {
    try {
      const session = await this.stripe().checkout.sessions.create(
        {
          mode: "payment",
          client_reference_id: p.reference,
          customer_email: p.donorEmail,
          line_items: [{ quantity: 1, price_data: { currency: p.currency.toLowerCase(), unit_amount: p.amount, product_data: { name: p.description.slice(0, 250) } } }],
          payment_intent_data: {
            ...(p.platformFee > 0 ? { application_fee_amount: p.platformFee } : {}),
            metadata: { ...p.metadata, reference: p.reference },
          },
          metadata: { ...p.metadata, reference: p.reference },
          success_url: p.successUrl,
          cancel_url: p.cancelUrl,
        },
        { stripeAccount: p.accountId, idempotencyKey: `checkout:${p.reference}` },
      );
      if (!session.url) throw new ProviderError("Stripe returned no checkout URL");
      return { checkoutUrl: session.url, providerPaymentId: session.id };
    } catch (e) {
      throw toProviderError(e);
    }
  }

  async verifyPayment(input: { reference: string; providerPaymentId?: string | null; accountId: string }): Promise<VerifiedPayment> {
    if (!input.providerPaymentId) return { status: "pending", reference: input.reference, providerPaymentId: null, providerChargeId: null, amount: null, currency: null, accountId: input.accountId, processingFee: null, paidAt: null };
    try {
      const s = await this.stripe().checkout.sessions.retrieve(
        input.providerPaymentId,
        { expand: ["payment_intent.latest_charge.balance_transaction"] },
        { stripeAccount: input.accountId },
      );
      return verifiedFromSession(s, input.accountId);
    } catch (e) {
      throw toProviderError(e);
    }
  }

  async refund(input: { providerPaymentId: string; amount: number; accountId: string }) {
    try {
      const s = await this.stripe().checkout.sessions.retrieve(input.providerPaymentId, {}, { stripeAccount: input.accountId });
      const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
      if (!pi) throw new ProviderError("No payment intent on session");
      const r = await this.stripe().refunds.create({ payment_intent: pi, amount: input.amount, refund_application_fee: true }, { stripeAccount: input.accountId });
      return { providerRefundId: r.id, status: r.status === "succeeded" ? ("succeeded" as const) : r.status === "failed" ? ("failed" as const) : ("pending" as const) };
    } catch (e) {
      throw toProviderError(e);
    }
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<NormalizedPaymentEvent> {
    const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "";
    const sig = headers.get("stripe-signature");
    if (!secret || !sig) throw new WebhookSignatureError();
    let event: Stripe.Event;
    try {
      event = this.stripe().webhooks.constructEvent(rawBody, sig, secret);
    } catch {
      throw new WebhookSignatureError();
    }
    return normaliseStripeEvent(event);
  }
}

function toProviderError(e: unknown) {
  if (e instanceof ProviderError) return e;
  const err = e as { message?: string; type?: string };
  return new ProviderError(`Stripe error: ${err?.type ?? ""} ${err?.message ?? String(e)}`);
}

export function snapshotFromAccount(a: Stripe.Account): AccountSnapshot {
  const due = [...(a.requirements?.currently_due ?? []), ...(a.requirements?.past_due ?? [])];
  const disabled = a.requirements?.disabled_reason ?? null;
  const bank = a.external_accounts?.data?.find((x) => x.object === "bank_account") as Stripe.BankAccount | undefined;
  let providerStatus: AccountSnapshot["providerStatus"];
  if (disabled && (disabled.startsWith("rejected") || disabled === "listed" || disabled === "platform_paused")) providerStatus = "restricted";
  else if (!a.details_submitted) providerStatus = "onboarding_required";
  else if (a.charges_enabled && a.payouts_enabled && due.length === 0) providerStatus = "verified";
  else if (a.charges_enabled === false && a.details_submitted && disabled && !disabled.startsWith("requirements.pending")) providerStatus = due.length ? "onboarding_required" : "restricted";
  else providerStatus = "pending";
  return {
    providerAccountId: a.id,
    providerStatus,
    accountName: a.business_profile?.name ?? a.settings?.dashboard?.display_name ?? null,
    bankName: bank?.bank_name ?? null,
    accountLast4: bank?.last4 ?? null,
    country: a.country ?? null,
    // Standard accounts can charge in many currencies; an empty list means "provider-supported currencies".
    currencies: [],
    chargesEnabled: !!a.charges_enabled,
    payoutsEnabled: !!a.payouts_enabled,
    requirements: due,
  };
}

export function verifiedFromSession(s: Stripe.Checkout.Session, accountId: string | null): VerifiedPayment {
  const pi = typeof s.payment_intent === "object" ? s.payment_intent : null;
  const charge = pi && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const bt = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
  // Processing fee excludes our application fee, which is reported separately.
  const stripeFee = bt?.fee_details?.filter((f) => f.type === "stripe_fee").reduce((sum, f) => sum + f.amount, 0) ?? null;
  const status: VerifiedPayment["status"] =
    s.payment_status === "paid" || s.payment_status === "no_payment_required" ? "succeeded" : s.status === "expired" ? "abandoned" : "pending";
  return {
    status,
    reference: s.client_reference_id ?? s.metadata?.reference ?? "",
    providerPaymentId: s.id,
    providerChargeId: typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
    amount: s.amount_total ?? null,
    currency: s.currency?.toUpperCase() ?? null,
    accountId,
    processingFee: stripeFee,
    paidAt: status === "succeeded" ? new Date((charge?.created ?? s.created) * 1000) : null,
  };
}

export function normaliseStripeEvent(event: Stripe.Event): NormalizedPaymentEvent {
  const accountId = event.account ?? null;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const v = verifiedFromSession(event.data.object, accountId);
      return { eventId: event.id, kind: v.status === "succeeded" ? "payment.succeeded" : "payment.pending", ...v };
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const v = verifiedFromSession(event.data.object, accountId);
      return { eventId: event.id, kind: "payment.failed", ...v, status: event.type === "checkout.session.expired" ? "abandoned" : "failed", failureReason: event.type };
    }
    case "charge.refunded": {
      const c = event.data.object;
      const latest = c.refunds?.data?.[0];
      return {
        eventId: event.id,
        kind: "refund.succeeded",
        reference: c.metadata?.reference ?? null,
        providerChargeId: typeof c.payment_intent === "string" ? c.payment_intent : (c.payment_intent?.id ?? null),
        providerRefundId: latest?.id ?? `${c.id}:${c.amount_refunded}`,
        amount: latest?.amount ?? c.amount_refunded,
        currency: c.currency.toUpperCase(),
        accountId,
      };
    }
    case "charge.dispute.created":
    case "charge.dispute.closed": {
      const d = event.data.object;
      const kind = event.type === "charge.dispute.created" ? "dispute.opened" : d.status === "won" ? "dispute.won" : "dispute.lost";
      return {
        eventId: event.id,
        kind,
        reference: (d.metadata?.reference as string | undefined) ?? null,
        providerChargeId: typeof d.payment_intent === "string" ? d.payment_intent : (d.payment_intent?.id ?? null),
        providerDisputeId: d.id,
        amount: d.amount,
        currency: d.currency.toUpperCase(),
        reason: d.reason,
        accountId,
      };
    }
    case "account.updated":
      return { eventId: event.id, kind: "account.updated", accountId: event.data.object.id };
    default:
      return { eventId: event.id, kind: "ignored", providerType: event.type };
  }
}
