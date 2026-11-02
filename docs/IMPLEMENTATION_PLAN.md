# Implementation plan and status

Legend: `[x]` implemented and covered by automated tests · `[~]` implemented, but only verifiable
end-to-end with external credentials (tested with fakes/simulator) · `[ ]` not implemented / planned.

## Phase 0 — Audit and planning
- [x] Repository audit (repository was empty; greenfield)
- [x] Product specification, architecture, security, implementation plan

## Phase 1 — Foundation
- [x] Next.js 16 + TS strict + Tailwind 4 + ESLint + Vitest + Playwright scaffolding
- [x] Prisma schema and migrations
- [x] Authentication: register, login, logout, email verification, password reset/change, sessions
- [x] Organisation registration, profile, images, community settings
- [x] Tenancy context, permission matrix, audit log
- [x] Membership: invitations, join requests, approval, roles, suspension/removal, ownership transfer, leave
- [x] Public website, member portal, admin portal, finance area, platform admin area

## Phase 2 — Community
- [x] Groups
- [x] Announcements and daily prayer points
- [x] Meeting scheduling with daily/weekly recurrence, time zones, cancellation, rescheduling, ICS
- [x] Prayer requests: visibility, anonymity, moderation, assignment, acknowledgements, updates, follow-ups
- [x] Testimonies with consent and moderation; content reports
- [x] Notifications: in-app, email outbox with retries, preferences, unsubscribe
- [x] Attendance: provider webhooks and host-marked; WhatsApp clicks are join intents only
- [ ] Browser push notifications; WhatsApp Business notifications

## Phase 3 — Live communication
- [~] LiveKit provider adapter (official SDK) behind `RealtimeProvider`
- [x] Token issuance with membership/visibility/time/lock/ban/admission/plan checks
- [~] Audio and video room UI: mic/camera/screen share, participants, raise hand, chat, agenda panel,
      connection state, reconnection, device-error handling
- [x] Host controls: mute, grant/revoke speaking, remove, admit/deny, lock, end (server-enforced)
- [x] LiveKit webhooks → attendance, live/ended state, usage minutes
- [x] WhatsApp link validation, classification and interstitial
- [ ] Recording (intentionally not implemented); large-audience egress/HLS

## Phase 4 — Fundraising
- [x] Provider abstraction; simulator provider
- [~] Paystack (subaccounts + split) and Stripe Connect (Standard, direct charges) adapters
- [x] Connection states, provider-confirmed verification, platform review for Paystack
- [x] Campaigns with approval workflow, updates, images
- [x] Checkout with server-derived parameters, review/disclosure page
- [x] Webhook signature verification, idempotency, tamper detection, server-side reconciliation
- [x] Append-only ledger, receipts, refunds, disputes, finance dashboard, CSV export
- [ ] Settlement ingestion from providers; recurring donations

## Phase 5 — Virtual gifts
- [x] Gift catalogue management; free gifts with server-broadcast feed and rate limiting
- [~] Paid gifts through the provider flow, recorded separately from donations

## Phase 6 — Programmes
- [x] Programmes, daily activities, enrolment, completion tracking, draft/published
- [ ] AI-assisted drafting (would always require human approval)

## Phase 7 — SaaS billing and platform admin
- [x] Plans, entitlements, server enforcement, lifecycle (trial, grace, expiry, cancel at period end)
- [~] Stripe Billing checkout, portal and webhooks; manual plan assignment
- [x] Platform admin: organisations, suspension, verification, plans, payment reviews, support, audit, health
- [ ] Custom domains; advanced custom branding beyond logo/accent

## Phase 8 — Production readiness
- [x] 126 unit/integration tests and 16 Playwright tests passing (as of Phase 9)
- [x] Typecheck, lint and `npm audit` clean; CI workflow
- [x] Deployment, operations, database, meetings, payments and subscriptions documentation
- [ ] External items in `docs/PRODUCTION_CHECKLIST.md`

## Phase 9 — Production hardening (no external credentials required)
- [x] Two-factor authentication (TOTP + recovery codes), platform-staff requirement, per-organisation requirement for elevated roles
- [x] Data-retention purge jobs with tests proving financial records are untouched
- [x] Accent-colour contrast validation; gold text token darkened to pass WCAG AA
- [x] axe-core accessibility scans in Playwright (24 pages, 0 violations)
- [x] Structured logging of unhandled server errors with optional alert webhook
- [~] Dockerfile and docker-compose stack (image build blocked in the sandbox; unverified)
- [ ] Staging deployment with real provider sandboxes (needs credentials — next phase)

## Acceptance criteria status
| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Register an organisation | ✅ | e2e step 1 |
| 2 | Configure public profile | ✅ | e2e step 1 |
| 3 | Invite members | ✅ | e2e step 3, tenancy tests |
| 4 | Assign roles | ✅ | e2e step 4, role tests |
| 5 | Create a prayer group | ✅ | e2e step 5 |
| 6 | Schedule a recurring meeting | ✅ | e2e step 6, recurrence tests |
| 7 | Attach a WhatsApp link | ✅ | e2e step 7 |
| 8 | Create an in-app audio meeting | ✅ | e2e step 8 (joining a real call needs LiveKit credentials) |
| 9 | Create an in-app video meeting | ✅ | e2e step 9 (same) |
| 10 | Invite authorised members to in-app meetings | ✅ | e2e step 10, token-access tests |
| 11 | Publish prayer points | ✅ | e2e step 11 |
| 12 | Receive confidential prayer requests | ✅ | e2e step 12 |
| 13 | Enforce request visibility | ✅ | e2e step 13, prayer tests |
| 14 | Create a fundraising campaign | ✅ | e2e step 14 |
| 15 | Connect an eligible payment account via provider flow | ✅ simulator / ⏳ Paystack & Stripe need credentials | e2e step 14–16 |
| 16 | Block live donations until verified | ✅ | e2e step 15–16, payment tests |
| 17 | Test donation in provider test environment | ✅ simulator / ⏳ real sandbox | e2e step 17 |
| 18 | Trusted server-side verification | ✅ | e2e (webhook withheld), payment tests |
| 19 | Record against the correct organisation | ✅ | tampering tests |
| 20 | Display transaction status | ✅ | donation result page |
| 21 | Receipt / confirmation | ✅ | receipt email + page |
| 22 | Duplicate events don't duplicate records | ✅ | payment tests, e2e reload |
| 23 | Reports for finance admins | ✅ | e2e step 23 |
| 24 | Unauthorised members blocked from reports | ✅ | e2e step 24, payment tests |
| 25 | Donations separate from subscription revenue | ✅ | separate tables/tests |
| 26 | Automated tests pass | ✅ | `npm test`, `npm run test:e2e` |
| 27 | Deploy via documentation | ⏳ | `docs/DEPLOYMENT.md` written; not yet deployed to a real environment |
