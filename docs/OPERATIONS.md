# Operations

## Monitoring
- **Health:** `GET /api/health` — alert on non-200 for > 2 minutes.
- **Logs:** structured JSON to stdout (`src/server/log.ts`) with sensitive keys redacted. Ship to your
  log platform (Vercel Log Drains, Datadog, Better Stack, Grafana Loki). Alert on:
  - `webhook.invalid_signature` spikes (misconfiguration or probing),
  - `webhook.processing_failed`, `payments.verification_mismatch` (**page someone**),
  - `tick.step_failed`, `email.delivery_failed`, `action.failed` / `api.failed` (include a `ref`
    shown to users — search logs by it).
- **Platform → Overview** shows integration configuration, failed/retrying emails, payment events
  stuck unprocessed > 10 minutes and the last webhook received.
- **Scheduler:** alert if `tick.completed` has not been logged for 15 minutes.
- Error tracking (Sentry or similar) is recommended but not yet integrated.

## Backups and recovery
- Enable the provider's automated daily backups **and** point-in-time recovery (≥ 7 days; 30 for
  production). Keep at least one weekly logical backup off-provider:
  `pg_dump --format=custom --no-owner "$DATABASE_URL" > backup-$(date +%F).dump`
- Object storage: enable versioning on the bucket.
- **Test restores quarterly:** restore into a scratch database, run `npx prisma migrate status`,
  start the app against it, sign in, open a finance report.
- Restore: `pg_restore --clean --no-owner -d "$TARGET_URL" backup.dump`, then `npx prisma migrate deploy`.
- Payment data is also held by providers: after a restore, use the finance donation page's
  "Check status with provider" for donations left `PENDING`, and replay missed webhooks from the
  Paystack/Stripe dashboards (processing is idempotent).
- Targets (proposed): RPO ≤ 15 minutes (PITR), RTO ≤ 4 hours.

## Routine tasks
| Task | How |
| --- | --- |
| Review Paystack organisation connections | `/platform/payments` → organisation → approve/reject |
| Suspend an organisation | `/platform/orgs/{id}` with a recorded reason (owner keeps read access to see why) |
| Assign/extend a plan manually | `/platform/orgs/{id}` → Subscription |
| Retry stuck emails | Automatic (exponential backoff, 8 attempts); failed ones are listed in Platform overview |
| Reconcile a pending donation | Finance → donation → "Check status with provider" |
| Rotate `CRON_SECRET` | Update env + scheduler together |
| Rotate provider keys | Update env; webhook secrets must match the provider dashboard |

## Incidents
- **Suspected payment tampering / mismatch:** the donation stays uncredited with a failure reason.
  Compare with the provider dashboard; never edit ledger rows — add corrective records via the
  provider (refund) so webhooks create the entries.
- **Data exposure concern:** check `AuditLog` for the organisation; sessions can be revoked by
  resetting the user's password (all sessions are invalidated).
- **Real-time outage:** WhatsApp meetings are unaffected; in-app rooms fail closed with a clear message.

## Data subject requests
Users export their data from Profile → "Download my data" and delete their account from Profile.
Requests received by email can be handled the same way after identity verification; financial
records are retained anonymised (see `docs/DATABASE.md`).
