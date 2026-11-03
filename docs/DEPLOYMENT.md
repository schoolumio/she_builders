# Deployment

The application is a single Next.js server plus PostgreSQL and a 5-minute scheduled call.

## Recommended topology
- **App:** Vercel (Node.js runtime) or any container host (Render, Fly.io, Railway, AWS ECS/App Runner).
  Region near your users and database (e.g. `eu-west`/`fra` for West Africa + Europe).
- **Database:** managed PostgreSQL 16 with automated backups and point-in-time recovery (Neon,
  Supabase, RDS, Cloud SQL, Render). Use a pooled connection string for serverless hosts.
- **Storage:** S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2) with a public read prefix
  `public/` served via CDN. Local disk storage is refused in production.
- **Email:** Resend (domain verified with SPF/DKIM/DMARC).
- **Real-time:** LiveKit Cloud (or self-hosted LiveKit).
- **Payments:** Paystack and/or Stripe accounts in test mode until approved.

## Environment variables
See `.env.example` for every variable with explanations. Production requirements:

| Variable | Notes |
| --- | --- |
| `APP_ENV=production` | Disables the payment simulator and sample seed data; requires S3 storage and an encryption key. |
| `APP_URL` | `https://` public origin; secure cookies depend on it. |
| `DATABASE_URL` | Pooled connection string with SSL. |
| `APP_ENCRYPTION_KEY` | 32 random bytes, base64. Signs unsubscribe links and encrypts sensitive fields. Rotating invalidates outstanding unsubscribe links. |
| `CRON_SECRET` | Long random string. |
| `EMAIL_DRIVER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` | |
| `STORAGE_DRIVER=s3`, `S3_*`, `STORAGE_PUBLIC_BASE_URL` | Public base URL is also added to the CSP `img-src`. |
| `STORAGE_DRIVER=database` | Alternative for demos/staging on hosts without a disk (Vercel): images stored in Postgres, served from `/api/files`. Use S3 for production scale. |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Optional; in-app meetings show "not configured" without them. |
| `PAYSTACK_SECRET_KEY` / `STRIPE_SECRET_KEY` + `STRIPE_CONNECT_WEBHOOK_SECRET` | Optional; providers without credentials are hidden. |
| `BILLING_PROVIDER`, `STRIPE_BILLING_WEBHOOK_SECRET` | See `docs/SUBSCRIPTIONS.md`. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Browser push. Generate once (`npx web-push generate-vapid-keys`); rotating the keys invalidates every existing browser subscription. |
| `PAYMENTS_SIMULATOR_ENABLED` | Ignored in production (simulator always off). |

Store secrets in the host's secret manager, never in the repository.

## Steps
```bash
npm ci
npx prisma migrate deploy          # run as a release step, before the new version serves traffic
npm run build                      # includes prisma generate
APP_ENV=production SEED_DEMO=0 npm run db:seed   # first deploy only: creates plans
npm start                          # or the host's Next.js runtime
```
Then:
1. Register the first account and promote it: `npm run admin:create -- you@domain` (needs DB access).
2. Configure webhooks: LiveKit → `/api/webhooks/livekit`; Paystack → `/api/webhooks/paystack`;
   Stripe Connect → `/api/webhooks/stripe/connect`; Stripe Billing → `/api/webhooks/stripe/billing`.
3. Schedule `/api/cron/tick` every 5 minutes with `Authorization: Bearer $CRON_SECRET`:
   - Vercel: `vercel.json` declares a once-a-day cron so it deploys on the free Hobby plan. On Pro,
     change it to `*/5 * * * *`; on Hobby, add an external 5-minute scheduler (see
     [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md)). Vercel sends the `CRON_SECRET` bearer automatically.
   - Elsewhere: `*/5 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://APP_URL/api/cron/tick`.
4. Health check: `GET /api/health` (200 = DB reachable).
5. Verify headers (CSP, HSTS) and run through `docs/PRODUCTION_CHECKLIST.md`.

## Docker
A multi-stage `Dockerfile` and a `docker-compose.yml` (Postgres + app) are included:

```bash
cp .env.example .env.staging     # fill in values; DATABASE_URL is set by compose
docker compose up --build        # http://localhost:3000
docker compose exec app npm run admin:create -- you@domain
```
The container runs `prisma migrate deploy` before starting; when running several replicas, run
migrations as a separate release step instead. If Docker Hub rate-limits you, build with
`--build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:22-slim`.
*The image could not be built in the development sandbox (registry access blocked), so the
Dockerfile is unverified — build it once in CI or locally before relying on it.*

## Error reporting
`src/instrumentation.ts` logs every unhandled server error as structured JSON with the request path,
route and the digest users see on the error page. Set `ERROR_WEBHOOK_URL` to also POST a short alert
(e.g. a Slack incoming webhook). A full error tracker (Sentry, etc.) can be added in the same hook.

## Not covered
Custom domains per organisation (planned premium feature), multi-region failover, CDN image resizing.
