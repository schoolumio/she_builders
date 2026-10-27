# Architecture

## 1. Stack and rationale

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 16 (App Router) + React 19 + TypeScript (strict)** | One deployable for marketing site, portals and API; server components keep secrets server-side; server actions have built-in origin checks. |
| Styling | **Tailwind CSS v4** with a small in-house accessible component set (`src/components/ui`) | No heavy UI dependency; tokens are CSS variables so brand colours are configurable. |
| Database | **PostgreSQL 16** | Relational integrity for tenants and money; enum arrays for roles. |
| ORM | **Prisma 6** | Mature migrations, typed queries, transactions. (Prisma 7/8 introduce mandatory driver adapters; upgrading is a contained change.) |
| Auth | **In-house session auth** (scrypt password hashing, opaque random session tokens stored as SHA-256 hashes, `HttpOnly; Secure; SameSite=Lax` cookies) | Follows the OWASP session cheat sheet and the pattern Lucia's maintainers recommend after deprecating Lucia; gives full control over multi-tenant checks and is fully testable. Social login can be added later. |
| Real-time | **LiveKit** (Cloud or self-hosted) via `livekit-server-sdk` and `@livekit/components-react` | Open-source SFU with official SDKs, server-issued JWT access tokens, server-side participant control (mute, remove, permission updates), signed webhooks, and a self-hosting escape hatch. Agora was considered; LiveKit's open-source server and permission model fit the provider abstraction better. |
| Payments | **Paystack** (subaccounts + split) and **Stripe Connect** (direct charges) behind `PaymentProvider` | Paystack covers Nigeria/Ghana/Kenya/South Africa; Stripe Connect covers international organisations with provider-hosted KYC. |
| Billing | **Stripe Billing** behind `BillingProvider` (optional) | Separate from donations. |
| Email | `EmailProvider` with `log` (dev) and `resend` (HTTP API) drivers + DB outbox | Retries, no vendor lock-in. |
| Storage | `StorageDriver` with `local` (dev) and `s3` (any S3-compatible) drivers | Public bucket/prefix for approved assets only. |
| Time zones | **Luxon** | Correct IANA zone / DST arithmetic for recurring meetings. |
| Validation | **Zod 4** | Shared schemas for actions and route handlers. |
| Tests | **Vitest** (unit + integration against a real Postgres test DB) and **Playwright** (E2E) | No real money or live media needed. |

No microservices: a single Next.js app plus a scheduled tick (`/api/cron/tick` or
`npm run cron:tick`) for reminders, outbox retries, occurrence materialisation and subscription
expiry.

## 2. Source layout

```
prisma/              schema.prisma, migrations, seed.ts (clearly labelled sample data)
src/app/             routes (UI + route handlers)
  (marketing)/       public website, legal drafts
  (auth)/            login, register, password reset, email verification
  app/               member home (cross-organisation)
  o/[slug]/          member portal for one organisation
  o/[slug]/admin/    organisation administration
  o/[slug]/finance/  finance administration
  c/[slug]/          public organisation profile + giving pages
  platform/          BridgeCodes platform administration
  api/               webhooks, LiveKit tokens, cron, exports, uploads
src/server/          server-only domain modules (never imported by client components)
  auth/              passwords, sessions, tokens, current user
  tenancy/           permissions, org context resolution, guards
  orgs/ members/ groups/ meetings/ prayer/ content/ programmes/
  payments/          provider adapters, donations, ledger, webhooks
  billing/           plans, entitlements, subscriptions, billing provider
  gifts/ notifications/ audit/ platform/ privacy/ storage/ email/ realtime/
src/lib/             isomorphic helpers (money formatting, dates, validation schemas)
src/components/      UI components
tests/               vitest unit + integration tests
e2e/                 Playwright journeys
```

### Module boundaries
Each `src/server/<module>` exposes **service functions that take an explicit actor/context**
(e.g. `createMeeting(ctx, input)`). Server actions in `src/app/**/actions.ts` are thin:
resolve the session → resolve the organisation context → call the service → revalidate.
This keeps business rules testable without HTTP and makes authorisation impossible to forget
in the UI layer.

## 3. Multi-tenancy

- Shared database, shared schema; every tenant-owned table has `organizationId` (FK, indexed).
  Exceptions are documented in `docs/DATABASE.md` (e.g. `User`, `Session`, `Plan`).
- `getOrgContext(userId, slug)` loads the organisation and the caller's **active** membership
  in one query and returns `{ org, membership, permissions }`. It throws `NotFoundError` (not
  `Forbidden`) for non-members of private resources to avoid leaking existence.
- Every service query includes `organizationId: ctx.org.id` *and* the object id, so a valid id
  from another tenant resolves to "not found" (IDOR protection).
- Organisation ids from the browser are never trusted; routes carry the slug, which is resolved
  against the session's memberships.

## 4. Authorisation model

Permissions are strings (`meetings.manage`, `prayer.view_confidential`, …). Roles map to
permission sets in `src/server/tenancy/permissions.ts`; a membership may hold several roles.
Platform roles (`SUPER_ADMIN`, `SUPPORT`) live on `User.platformRole` and grant **no**
organisation permissions. Object-level checks (e.g. prayer-request visibility, meeting
visibility) are implemented as pure functions with unit tests.

## 5. Meetings and real-time

```
Meeting (series: mode, format, recurrence, tz, visibility, hosts, agenda)
  └─ MeetingOccurrence (UTC start/end, status, roomName, locked)  ← materialised 90 days ahead
        ├─ MeetingAdmission (waiting room requests)
        ├─ MeetingAttendance (provider webhook / host-marked)
        ├─ MeetingJoinIntent (WhatsApp clicks — not attendance)
        └─ GiftEvent
```

`RealtimeProvider` interface (`src/server/realtime/provider.ts`):
`isConfigured()`, `createAccessToken()`, `ensureRoom()`, `updateParticipantPermissions()`,
`setParticipantAttributes()`, `muteParticipant()`, `removeParticipant()`, `sendServerData()`,
`closeRoom()`, `verifyWebhook()`. `LiveKitProvider` implements it with the official SDK; tests
use an in-memory fake. See `docs/MEETINGS.md`.

Interactive rooms vs. broadcasts: `format = BROADCAST` grants publish rights only to hosts and
approved speakers; everybody else subscribes. For thousands of passive listeners the documented
path is LiveKit Egress → HLS/RTMP (not implemented; see `docs/MEETINGS.md`).

## 6. Payments

```
PaymentProvider (interface) ── PaystackProvider | StripeConnectProvider | SimulatorProvider
PaymentProviderConnection (org ↔ provider account, state machine)
FundraisingCampaign → Donation (state machine) → LedgerEntry (append-only)
                                  ├─ Refund, Dispute, SettlementRecord
PaymentWebhookEvent (provider, eventId UNIQUE)  ← idempotency
```

Webhook flow: raw body → signature verification → insert `PaymentWebhookEvent` (duplicate ⇒
200 no-op) → load donation by provider reference **and** connection → verify amount, currency,
recipient account against the server record → transition state in a DB transaction → append
ledger entries → enqueue receipt. See `docs/PAYMENTS.md`.

## 7. Billing

`Plan` + `PlanEntitlement` (feature key, enabled, numeric limit) → `Subscription` (one per org)
→ `SubscriptionInvoice`. `getEntitlements(orgId)` computes the effective plan (falls back to
FREE when expired/cancelled past grace). Guards: `assertFeature(ctx, key)`,
`assertLimit(ctx, key, currentCount)`. See `docs/SUBSCRIPTIONS.md`.

## 8. Background work

`runScheduledTick()` (idempotent, safe to run every 5 minutes):
1. Materialise meeting occurrences for the next 90 days.
2. Send meeting reminders (once per occurrence per user — unique constraint).
3. Send prayer follow-up reminders.
4. Retry failed outbound emails with backoff.
5. Expire subscriptions whose grace period ended.
6. Purge expired sessions, tokens and rate-limit windows.

## 9. Cross-cutting

- **Errors**: `AppError` subclasses map to safe user messages; unexpected errors are logged with
  a correlation id and shown generically.
- **Logging**: `src/server/log.ts` emits structured JSON and redacts known sensitive keys.
- **Rate limiting**: Postgres fixed-window counters (`RateLimitBucket`) so limits hold across
  instances without Redis.
- **Security headers**: CSP, HSTS, frame-ancestors, referrer policy in `next.config.ts`.
- **Branding**: `src/config/brand.ts` (env-driven) + per-organisation logo and accent colour.
