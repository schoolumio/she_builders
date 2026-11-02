# Production checklist

The application is **not** production-ready until every item below is checked. Items marked
**(external)** depend on accounts, approvals or people outside this codebase.

## Infrastructure
- [ ] Managed PostgreSQL 16 with SSL, PITR and tested restore **(external)**
- [ ] `APP_ENV=production`, `APP_URL=https://…`, strong `APP_ENCRYPTION_KEY` and `CRON_SECRET`
- [ ] `npx prisma migrate deploy` as a release step; plans seeded once
- [ ] S3-compatible bucket + CDN; `STORAGE_PUBLIC_BASE_URL` set **(external)**
- [ ] Scheduler hitting `/api/cron/tick` every 5 minutes; alert on missed runs
- [ ] Health check and log shipping with the alerts in `docs/OPERATIONS.md`
- [ ] Error tracking (e.g. Sentry) integrated — *not yet done*

## Email
- [ ] Resend account, sending domain with SPF, DKIM and DMARC **(external)**
- [ ] Test verification, password reset, invitation and receipt emails in production

## Real-time meetings
- [ ] LiveKit Cloud project (region chosen) and keys **(external)**
- [ ] LiveKit webhook to `/api/webhooks/livekit`; attendance verified with two real devices
- [ ] Manual test on Android Chrome, iOS Safari and desktop: mic/camera permissions, denial,
      reconnection after network loss, host mute/remove/lock, waiting room, broadcast speaker grants
- [ ] Cost model reviewed vs. plan participant limits

## Payments (donations)
- [ ] Legal advice on the Paystack split/subaccount model for third-party organisations **(external)**
- [ ] Paystack written approval of the use case; live keys only after approval **(external)**
- [ ] Stripe Connect platform approval for the target countries/organisation types **(external)**
- [ ] Full sandbox run with real Paystack and Stripe test keys: onboarding, success, failure,
      refund, dispute, webhook retries — *not yet done (no credentials)*
- [ ] Webhook endpoints registered with signing secrets; replay tested
- [ ] Organisation review procedure for Paystack connections documented for BridgeCodes staff
- [ ] Refund, dispute and fee disclosure wording approved **(external)**
- [ ] Platform fee left at 0% unless a reviewed, disclosed fee is approved

## Subscriptions
- [ ] Decide billing provider; if Stripe Billing: products, prices, portal, webhook **(external)**
- [ ] Final prices and entitlements entered in `/platform/plans`
- [ ] End-to-end test of upgrade, downgrade, cancellation, failed payment → grace → expiry

## Security review
- [x] Server-side authorisation on every action/route; tenant-isolation tests
- [x] Webhook signature verification and idempotency tests
- [x] Rate limiting on auth, invitations, prayer requests, gifts, donations, support
- [x] CSP, HSTS, frame-ancestors, nosniff, referrer policy
- [x] `npm audit` clean (with documented overrides)
- [ ] Independent penetration test **(external)**
- [ ] Review CSP `'unsafe-inline'` for scripts (nonce-based CSP would remove it)
- [ ] Decide whether to require email verification before joining communities
- [ ] Add MFA for owners, finance administrators and platform staff — *not implemented*
- [ ] Purge job for `EmailOutbox` and audit-log retention policy — *not implemented*

## Accessibility & UX
- [x] Labelled form fields, visible focus, skip link, keyboard-operable controls, reduced motion
- [x] Mobile layout checks in Playwright (no horizontal overflow, touch target size)
- [ ] Manual screen-reader pass (NVDA/VoiceOver) and axe audit of key pages
- [ ] Colour-contrast audit including organisation accent colours (accent is not validated for contrast)

## Legal
- [ ] Privacy policy, terms, community guidelines and fundraising disclosures reviewed by counsel
      for Nigeria (NDPA 2023) and each launch market (e.g. UK/EU GDPR) **(external)**
- [ ] Data processing agreements with sub-processors (hosting, LiveKit, Resend, Paystack, Stripe) **(external)**
- [ ] Scripture translation licensing guidance for organisations

## Launch
- [ ] First platform super admin created via `npm run admin:create`
- [ ] Sample data absent from production (`SEED_DEMO=0`, `APP_ENV=production`)
- [ ] Support inbox monitored; `BRAND_SUPPORT_EMAIL` / `SECURITY_CONTACT_EMAIL` set
