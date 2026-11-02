# Database

PostgreSQL 16 via Prisma 6. Schema: `prisma/schema.prisma`. Migrations: `prisma/migrations/`.

## Commands
| Task | Command |
| --- | --- |
| Apply migrations (any environment) | `npx prisma migrate deploy` |
| Create a migration during development | `npm run db:migrate -- --name <change>` |
| Seed plans (+ sample data outside production) | `npm run db:seed` (`SEED_DEMO=0` to skip samples) |
| Inspect data locally | `npm run db:studio` |

Never run `prisma migrate reset`, `db push --accept-data-loss` or the test suites against a
production database. Test suites only operate on databases whose names contain `test`/`e2e`.

## Conventions
- Money: integer minor units (`Int`) + ISO-4217 `currency`. Per-transaction maximum is enforced by
  campaigns (`maxAmount`, default 10,000,000.00 major units).
- Timestamps are UTC. Meetings keep the local `startDate`/`startTime` and IANA `timezone` so
  recurrences survive DST.
- IDs are CUIDs. Tokens (sessions, auth, invitations) are stored only as SHA-256 hashes.

## Tenant ownership
Every tenant-owned table has `organizationId` with an index, **except** these, with reasons:

| Table | Why no `organizationId` |
| --- | --- |
| `User`, `Session`, `AuthToken`, `NotificationPreference` | People span organisations. |
| `RateLimitBucket`, `EmailOutbox` | Platform infrastructure. |
| `Plan`, `PlanEntitlement`, `PlatformSetting`, `BillingWebhookEvent` | Platform-wide catalogue/config. |
| `PaymentWebhookEvent`, `RealtimeWebhookEvent`, `SimulatorRecord` | Provider event stores; the referenced records carry the tenant. |
| `MeetingHost`, `MeetingInvitee`, `MeetingAgendaItem`, `MeetingAdmission`, `MeetingRoomBan`, `MeetingParticipantState`, `MeetingReminderLog` | Children of `Meeting`/`MeetingOccurrence`, always reached through the tenant-scoped parent. |
| `PrayerAcknowledgement`, `PrayerRequestUpdate`, `ProgrammeActivity`, `ProgrammeEnrollment`, `ActivityCompletion`, `CampaignUpdate` | Children of tenant-scoped parents. |
| `AuditLog`, `Notification`, `SupportRequest` | Nullable `organizationId` (platform-level events exist). |

## Key constraints
- `Membership (organizationId, userId)` unique; roles are a Postgres enum array.
- `MeetingOccurrence (meetingId, originalStartsAt)` unique → idempotent materialisation; `roomName` unique.
- `MeetingAttendance (occurrenceId, userId)` unique; `MeetingReminderLog (occurrenceId, userId, kind)` unique → reminders sent once.
- `Donation.reference` unique; `(provider, providerPaymentId)` unique.
- `PaymentWebhookEvent (provider, eventId)` unique → webhook idempotency.
- `LedgerEntry (donationId, type, sourceEventId)` unique → no duplicate ledger lines.
- `GiftEvent.donationId` unique → one gift per paid-gift payment.
- `PaymentProviderConnection (provider, providerAccountId)` unique.

## Referential behaviour
- Deleting an organisation cascades community content but is **restricted** by financial tables
  (`Donation`, `LedgerEntry`, `Refund`, `Dispute`, `SettlementRecord`, `FundraisingCampaign`,
  `PaymentProviderConnection`). Organisations are closed (`status = CLOSED`), not deleted, once they
  have financial history.
- Deleting a user cascades their personal content; donations use `SetNull` and are anonymised by
  the account-deletion workflow.

## Financial records
`LedgerEntry` is append-only: no code path updates or deletes ledger rows. Corrections are new
entries (refund, dispute hold/release). Gross, processing fee, platform fee, refunds, net and
settlement are separate types — see `docs/PAYMENTS.md`.

## Retention (proposed defaults — confirm with legal counsel)
| Data | Retention |
| --- | --- |
| Sessions | Until expiry (30 days sliding); purged by the scheduler |
| Auth tokens | Purged 7 days after expiry |
| Rate-limit buckets | Purged after 24 hours |
| Prayer requests, testimonies | Until deleted by the author, the author's account is deleted, or the organisation is closed |
| Donations, ledger, refunds, disputes | Retained for statutory record-keeping (e.g. 6–7 years); donor identity removed on account deletion |
| Audit log | Purged after `AUDIT_RETENTION_DAYS` (default 730) by the scheduler |
| Email outbox | Sent / permanently failed messages purged after 30 days (pending kept for retry) |
| Read notifications | Purged after 180 days (unread kept) |
| WhatsApp join intents | Purged after 365 days |
| Real-time webhook events | Purged after 90 days |
| Payment webhook events | Retained (financial audit trail) |

Retention periods live in `RETENTION_DAYS` (`src/server/jobs/tick.ts`) and are covered by
`tests/integration/retention.test.ts`, which also asserts financial records are never purged.
