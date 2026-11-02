# Subscriptions and plans

Subscriptions are what an organisation pays BridgeCodes for the software. They are **completely
separate** from donations: different tables (`Subscription`, `SubscriptionInvoice`,
`BillingWebhookEvent` vs `Donation`, `LedgerEntry`, `PaymentWebhookEvent`), different provider
account (BridgeCodes' own Stripe account) and a different webhook endpoint and secret.

## Plans and entitlements
Default concepts (`src/server/billing/catalog.ts`, seeded idempotently): FREE, COMMUNITY, GROWTH,
MINISTRY, ENTERPRISE. Prices shown are placeholders, not commitments. The **database** is the
source of truth: platform super admins edit prices, trials, grace periods, the optional donation
platform fee and every entitlement at `/platform/plans`.

Entitlement keys (`PlanEntitlement`): features `feature.prayer_requests`, `feature.recurring_meetings`,
`feature.in_app_audio`, `feature.in_app_video`, `feature.groups`, `feature.programmes`,
`feature.fundraising`, `feature.paid_gifts`, `feature.reports`, `feature.email_notifications`,
`feature.custom_branding`; limits `limit.members`, `limit.admins`, `limit.groups`,
`limit.active_meetings`, `limit.room_participants` (`null` = unlimited).

Enforcement is server-side only (`assertFeature`, `assertWithinLimit` in
`src/server/billing/entitlements.ts`) at the point of use: inviting/approving/joining members,
granting admin roles, creating groups, meetings, in-app rooms, prayer requests, programmes,
fundraising onboarding/campaigns, paid gifts. A client cannot unlock anything by changing a form
value (tested). After a downgrade, existing content is kept but new additions beyond the limit are refused.

## Lifecycle
| Status | Plan granted? |
| --- | --- |
| `TRIALING` | Until `trialEndsAt` |
| `ACTIVE` | Until `currentPeriodEnd` (if set) |
| `PAST_DUE` | Until `graceEndsAt` |
| `CANCELED` | Until `currentPeriodEnd` (cancellation takes effect at period end) |
| `EXPIRED` | No — falls back to FREE (`degraded` banner shown to admins) |

Manual (non-Stripe) subscriptions move ACTIVE → PAST_DUE (+grace) → EXPIRED via the scheduler
(`nextLifecycleState`, unit tested). Stripe-managed subscriptions follow Stripe webhooks.

## Billing provider
`BILLING_PROVIDER=none` (default): the billing page says online billing is not configured; platform
super admins assign plans manually at `/platform/orgs/{id}` (audited). This is the honest state
until Stripe Billing is set up.

`BILLING_PROVIDER=stripe`:
1. In BridgeCodes' Stripe account create a Product + monthly/yearly Prices per paid plan; paste
   the price ids into `/platform/plans`.
2. Set `STRIPE_SECRET_KEY`.
3. Add a webhook endpoint `https://<APP_URL>/api/webhooks/stripe/billing` for
   `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`,
   `invoice.payment_failed`, `invoice.finalized`; set `STRIPE_BILLING_WEBHOOK_SECRET`.
4. Enable the Stripe customer portal (plan changes, payment methods, invoices, cancellation).

Owners start checkout from Plan & billing; existing subscribers are sent to the customer portal for
upgrades/downgrades (Stripe handles proration). Cancellation is at period end. Invoices are recorded
in `SubscriptionInvoice` and shown as billing history.

**Not implemented:** Paystack-based subscription billing for organisations that cannot pay by
card through Stripe (a `BillingProvider` adapter can be added), tax calculation, coupons.

**Untested:** the Stripe Billing integration has not been exercised against a real Stripe account.
