# Payments and fundraising

**Principle:** donations belong to the community. They settle to the organisation's own verified
provider account. BridgeCodes never holds, pools or redistributes donated funds, and the browser is
never trusted for amounts, currency, recipient or payment status.

## Providers
| Provider | Model | Onboarding | Who is merchant of record | Status in this codebase |
| --- | --- | --- | --- | --- |
| **Paystack** | Split payments to a per-organisation **subaccount** under the BridgeCodes integration; `percentage_charge: 0`, platform fee (if any) as flat `transaction_charge`, `bearer: subaccount` | Bank details posted server-side to Paystack's resolve + subaccount APIs (only last 4 digits stored) **and** BridgeCodes organisation review | BridgeCodes' Paystack integration (Paystack settles the subaccount share to the organisation's bank) | Implemented; **untested against live Paystack** (no credentials) |
| **Stripe Connect** | **Standard** connected accounts, **direct charges** (`stripeAccount` header), optional `application_fee_amount` | Stripe-hosted onboarding (Account Links); Stripe KYC | The organisation | Implemented; **untested against live Stripe** (no credentials) |
| **Simulator** | Local stand-in with hosted onboarding/checkout pages and HMAC-signed webhooks | Simulated | — | Development/tests only; refused when `APP_ENV=production` |

### Commercial and compliance prerequisites (must be completed by BridgeCodes)
- **Paystack:** confirm in writing that the BridgeCodes business may create subaccounts for
  third-party faith organisations and process donations for them (split payments), and which
  organisation documents Paystack requires. Paystack's split model makes the BridgeCodes integration
  the merchant of record; legal advice is needed on whether this constitutes collecting funds on
  behalf of third parties in Nigeria and other markets.
- **Stripe:** confirm Connect platform eligibility for donations to religious organisations in the
  target countries; Standard accounts make each organisation its own merchant of record.
- Fee disclosure, refund policy and receipt wording reviewed by counsel.
- Do not enable live keys until the above is done (`docs/PRODUCTION_CHECKLIST.md`).

## Connection states
`NOT_CONFIGURED` → `ONBOARDING_REQUIRED` → `PENDING_VERIFICATION` → `VERIFIED` (or `RESTRICTED`,
`DISCONNECTED`). `deriveConnectionStatus` (`src/server/payments/status.ts`) returns `VERIFIED` only
when the **provider** reports the account can accept charges and, for Paystack, a BridgeCodes super
admin has approved the organisation (`/platform/payments`). Entering a bank account number never
enables donations by itself. `donationReadiness()` is the single gate: organisation active,
fundraising switched on, plan includes `feature.fundraising`, verified connection, provider
available, currency supported. It is checked when a donation starts and again at checkout.

## Donation flow
1. Donor opens `/c/{slug}/give/{campaign}` and chooses a suggested/custom amount.
2. `startDonation` validates the amount against the campaign (min/max/suggested), derives
   organisation, currency, connection and platform fee **on the server**, and stores a `PENDING`
   donation with an unguessable reference. Extra form fields (currency, org id, connection id, fee)
   are ignored — covered by tests.
3. Review page `/donations/{reference}` shows recipient, amount, platform fee, who charges processing
   fees, provider and test mode.
4. `createCheckout` re-checks readiness and creates the provider-hosted checkout.
5. The provider confirms via signed webhook **or** the return page asks the provider's API
   (`reconcileDonation`). The redirect itself proves nothing.
6. `processPaymentEvent` (`src/server/payments/events.ts`):
   - stores `(provider, eventId)` — duplicates return `duplicate`;
   - re-verifies with the provider API where supported;
   - compares amount, currency and recipient account with the server record — any mismatch is
     **not credited** and is flagged (`payments.verification_mismatch` audit event);
   - transitions state with a conditional update (one winner under concurrency) per the state machine;
   - writes ledger entries (`CHARGE`, `PROCESSING_FEE`, `PLATFORM_FEE`) with unique keys;
   - sends one receipt (claimed via `receiptSentAt`).

Refunds: finance admins request them; the record is credited only when the provider confirms
(synchronous API response or webhook) → `REFUND` ledger entry, donation `PARTIALLY_REFUNDED` /
`REFUNDED`. Disputes: `DISPUTE_HOLD` on open, `DISPUTE_RELEASE` if won, `DISPUTE_LOSS` (zero, for
reporting) if lost. Settlement records are modelled (`SettlementRecord`, `SETTLEMENT` ledger type) but
**settlement ingestion is not implemented**; "net due" is never presented as money in the bank.

## Webhook endpoints
| Endpoint | Signature |
| --- | --- |
| `/api/webhooks/paystack` | `x-paystack-signature` = HMAC-SHA512(secret key, raw body). Event id = `${event}:${data.id}` (Paystack has no event ids). Events: `charge.success`, `charge.failed`, `refund.processed/failed`, `charge.dispute.create/resolve`. |
| `/api/webhooks/stripe/connect` | `stripe-signature`, secret `STRIPE_CONNECT_WEBHOOK_SECRET` (a **Connect** endpoint, "events on connected accounts"). Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded/failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created/closed`, `account.updated`. |
| `/api/webhooks/simulator` | `x-simulator-signature` = HMAC-SHA256(`PAYMENTS_SIMULATOR_SECRET`). Disabled in production. |

Invalid signatures → 401. Processing errors → 500 so the provider retries (processing is idempotent).

## Platform fee
Configured per plan (`Plan.platformFeeBps`, default **0**, max 10%, editable at `/platform/plans`).
Rounded down, shown on the review page, recorded separately as `PLATFORM_FEE`, passed to the
provider through its supported mechanism. Never hard-coded.

## Paid virtual gifts
Optional, off by default (`Organization.paidGiftsEnabled` + `feature.paid_gifts`). Same provider and
verification path; stored with `purpose = GIFT`, excluded from donation reports/totals/receipt wording,
and turned into a `GiftEvent` exactly once after confirmation. No virtual currency or stored balances.

## Sandbox testing
**Simulator (no credentials):** set `PAYMENTS_SIMULATOR_ENABLED=true`. As a finance admin: Finance →
Payment account → "Connect with Payment simulator" → choose *pending* or *approve*. Create and approve
a campaign, open its public give page, donate, and on the simulated checkout choose success / pending
/ decline, with or without delivering the webhook. Automated tests cover success, failure, pending,
duplicate webhooks, invalid signatures, amount/currency/recipient tampering, refunds, restricted
accounts, missing configuration and cross-tenant access (`tests/integration/payments.test.ts`,
`e2e/acceptance.spec.ts`).

**Paystack test mode:** set `PAYSTACK_SECRET_KEY=sk_test_…`. Point the dashboard webhook to
`/api/webhooks/paystack` (use a tunnel such as `cloudflared` locally). Paystack test mode resolves
only its documented test bank accounts; use Paystack's test cards on checkout. Approve the
organisation at `/platform/payments` before donating.

**Stripe test mode:** set `STRIPE_SECRET_KEY=sk_test_…` and create a Connect webhook endpoint for
`/api/webhooks/stripe/connect` (or `stripe listen --forward-connect-to localhost:3000/api/webhooks/stripe/connect`).
Use Stripe's test onboarding data and test card `4242 4242 4242 4242`.

## Data handling
No card data, CVCs, online-banking credentials or organisation provider secrets are ever stored.
Paystack account numbers transit the server once (to Paystack) and only the last four digits, bank
name and subaccount code are kept. Provider errors are logged without bodies; users see generic messages.
