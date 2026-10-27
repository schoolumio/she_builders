# Implementation Plan

Legend: `[x]` implemented and tested · `[~]` implemented, needs external credentials to verify
end-to-end · `[ ]` not started / planned.

## Phase 0 — Audit and planning
- [x] Repository audit (empty repository; greenfield)
- [x] Product specification, architecture, security, implementation plan

## Phase 1 — Foundation
- [ ] Project scaffolding (Next.js 16, TS strict, Tailwind 4, ESLint, Vitest, Playwright)
- [ ] Prisma schema + initial migration
- [ ] Authentication (register, login, logout, verify email, reset password)
- [ ] Organisation registration and settings
- [ ] Tenancy context, permission system, audit log
- [ ] Membership, invitations, join requests, role management
- [ ] Public website, member portal shell, admin portal shell

## Phase 2 — Community
- [ ] Groups
- [ ] Announcements, prayer points
- [ ] Meeting scheduling with recurrence and time zones
- [ ] Prayer requests with visibility, moderation, assignment
- [ ] Testimonies
- [ ] Notifications (in-app + email outbox) and preferences
- [ ] Attendance (provider webhooks, host-marked)

## Phase 3 — Live communication
- [ ] Realtime provider abstraction + LiveKit adapter
- [ ] Token endpoint with full access checks
- [ ] Audio / video room UI, host controls, raise hand, admission, lock, removal
- [ ] LiveKit webhooks → attendance
- [ ] WhatsApp join flow with interstitial

## Phase 4 — Fundraising
- [ ] Payment provider abstraction (Paystack, Stripe Connect, simulator)
- [ ] Connection onboarding and states
- [ ] Campaigns with approval
- [ ] Checkout, webhook processing, verification, ledger
- [ ] Receipts, refunds, disputes, finance dashboard, CSV export

## Phase 5 — Virtual gifts
- [ ] Gift catalogue management
- [ ] Free gifts with server-broadcast feed
- [ ] Paid gifts via provider checkout (disabled by default)

## Phase 6 — Programmes
- [ ] Programmes, activities, enrolment, completion

## Phase 7 — SaaS billing and platform admin
- [ ] Plans, entitlements, server enforcement
- [ ] Subscriptions, Stripe Billing adapter, manual assignment
- [ ] Platform admin area

## Phase 8 — Production readiness
- [ ] Test suite green, security/tenant/payment reviews
- [ ] Deployment, operations, production checklist docs
