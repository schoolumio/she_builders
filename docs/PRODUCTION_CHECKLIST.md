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
- [x] Unhandled server errors logged with digests (`src/instrumentation.ts`), optional `ERROR_WEBHOOK_URL` alert
- [ ] Full error tracker (e.g. Sentry) connected **(external)**
- [ ] Docker image built and smoke-tested in CI (could not be built in the dev sandbox)

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
- [x] Two-factor authentication; required for platform staff in production; optional requirement for elevated organisation roles
- [ ] Enable "require two-factor for administrators" in pilot organisations and brief owners
- [x] Retention purge jobs (email outbox, notifications, join intents, realtime events, audit log)
- [ ] Retention periods confirmed by legal counsel **(external)**

## Accessibility & UX
- [x] Labelled form fields, visible focus, skip link, keyboard-operable controls, reduced motion
- [x] Mobile layout checks in Playwright (no horizontal overflow, touch target size)
- [x] Automated axe WCAG 2.1 A/AA scan of 24 public, member, admin and finance pages (passing)
- [x] Organisation accent colours must have ≥ 4.5:1 contrast with white text
- [ ] Manual screen-reader pass (NVDA/VoiceOver), including the live meeting room

## Legal
- [ ] Privacy policy, terms, community guidelines and fundraising disclosures reviewed by counsel
      for Nigeria (NDPA 2023) and each launch market (e.g. UK/EU GDPR) **(external)**
- [ ] Data processing agreements with sub-processors (hosting, LiveKit, Resend, Paystack, Stripe) **(external)**
- [ ] Scripture translation licensing guidance for organisations

## Launch
- [ ] First platform super admin created via `npm run admin:create`
- [ ] Sample data absent from production (`SEED_DEMO=0`, `APP_ENV=production`)
- [ ] Support inbox monitored; `BRAND_SUPPORT_EMAIL` / `SECURITY_CONTACT_EMAIL` set
