# AltarCall

*Where prayer communities come together.*

A multi-tenant SaaS platform for online prayer communities, women's ministries, church prayer
departments, Bible study groups and fellowships: membership, WhatsApp / in-app audio / in-app
video meetings, prayer points, confidential prayer requests, testimonies, programmes,
community-owned fundraising and SaaS subscriptions.

Built by **BridgeCodes** (a business of **Numi Innovations Ltd**). The product name, tagline and
wordmark come from `src/config/brand.ts` / `BRAND_*` env vars; the logo mark is
`src/components/brand-mark.tsx` (vector) with the original artwork in `public/brand/`.

> **Status:** feature-complete for the initial release scope and covered by automated tests, but
> **not yet production-ready**: live LiveKit, Paystack/Stripe, email and storage credentials,
> provider approvals and legal review are still required. See
> [`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md).

## Stack
Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · PostgreSQL 16 ·
Prisma 6 · LiveKit · Paystack · Stripe Connect / Billing · Vitest · Playwright.

## Quick start (development)

Requirements: Node.js ≥ 20.9 (22 recommended), PostgreSQL 16.

```bash
npm install
cp .env.example .env           # then edit DATABASE_URL, APP_ENCRYPTION_KEY, CRON_SECRET
npx prisma migrate deploy      # or `npm run db:migrate` while developing the schema
npm run db:seed                # plans + clearly labelled SAMPLE data (skipped when APP_ENV=production)
npm run dev                    # http://localhost:3000
```

Sample logins created by the seed (development only): `owner@sample.test`,
`coordinator@sample.test`, `finance@sample.test`, `host@sample.test`, `member@sample.test`, all with
password `SamplePass123!`. Generate meeting occurrences for the sample meetings with
`npm run cron:tick` (needs the app running and `CRON_SECRET` set).

With `EMAIL_DRIVER=log`, emails (verification, password reset, invitations, receipts) are printed to
the server console. With `PAYMENTS_SIMULATOR_ENABLED=true` (never in production) a local payment
simulator lets you test onboarding, donations, refunds and webhooks without real money.

### Creating the first platform administrator
Register normally through the website, confirm the email, then on a machine with database access:

```bash
npm run admin:create -- you@bridgecodes.example            # SUPER_ADMIN
npm run admin:create -- support@bridgecodes.example SUPPORT  # read-only staff
```

Platform roles grant no access to any organisation's content.

## Tests

```bash
npm run typecheck && npm run lint
npm test            # 110 unit + integration tests against a real Postgres (TEST_DATABASE_URL, default prayer_test)
npm run build
npm run test:e2e    # Playwright acceptance + mobile tests (E2E_DATABASE_URL, default prayer_e2e)
```

Test databases must contain `test` / `e2e` in their names; the suites refuse anything else. No
real money, LiveKit account or email provider is needed to run the tests.

## Documentation
| Document | Contents |
| --- | --- |
| [Product specification](docs/PRODUCT_SPECIFICATION.md) | Audit, scope, personas, features |
| [Architecture](docs/ARCHITECTURE.md) | Stack decisions, module boundaries, tenancy |
| [Security](docs/SECURITY.md) | Threat model, permission matrix, data protection |
| [Implementation plan](docs/IMPLEMENTATION_PLAN.md) | Phase checklist and acceptance status |
| [Database](docs/DATABASE.md) | Schema, ownership, migrations, retention |
| [Meetings](docs/MEETINGS.md) | WhatsApp + LiveKit setup, room security, webhooks |
| [Payments](docs/PAYMENTS.md) | Paystack / Stripe Connect setup, sandbox testing, ledger |
| [Subscriptions](docs/SUBSCRIPTIONS.md) | Plans, entitlements, Stripe Billing |
| [Deployment](docs/DEPLOYMENT.md) | Environment, hosting, cron, storage, email |
| [Operations](docs/OPERATIONS.md) | Monitoring, backups, recovery, incidents |
| [Production checklist](docs/PRODUCTION_CHECKLIST.md) | Everything required before launch |
| [Local testing on Windows](docs/LOCAL_TESTING_WINDOWS.md) | Step-by-step guide for Windows `cmd` |
