# Product Specification — Prayer Community Platform

> Working name: **Prayer Community Platform**. The commercial brand is not final; product
> name, logo and colours are configuration (`src/config/brand.ts` and `BRAND_*` environment
> variables) and organisations can apply their own logo and accent colour.
>
> Owner and operator: **BridgeCodes**, a software business of **Numi Innovations Ltd**.

## 1. Repository audit (Phase 0)

The repository `schoolumio/she_builders` contained **no commits and no files** when work began
(branch `claude/amazing-dirac-4sq9x8`, empty working tree). There was no existing framework,
authentication, database, payment integration, test suite or deployment configuration to
preserve. The architecture in `docs/ARCHITECTURE.md` was therefore chosen from scratch.

## 2. Vision

A global, multi-tenant platform where prayer communities, women's ministries, church prayer
departments, Bible study groups and fellowships run their community life online: membership,
meetings (WhatsApp, in-app audio, in-app video), prayer points, confidential prayer requests,
testimonies, programmes, and fundraising that settles **to the community's own verified payment
account** — not to BridgeCodes.

Initial focus: online-first, women-led prayer communities. Nothing in the product assumes a
denomination, worship style or visual identity.

### Core principles

1. **Each organisation chooses** its meeting mode and its fundraising arrangement.
2. **Tenant isolation is foundational**: every tenant-owned record carries `organizationId`,
   and every query is scoped by a membership resolved on the server.
3. **Least privilege**: roles are additive permission sets. Finance administrators do not see
   prayer requests; prayer coordinators do not see financial records; platform administrators do
   not see community content.
4. **Provider-confirmed money only**: a donation succeeds only when the payment provider
   confirms it (verified webhook or server-side verification call). Browser redirects never
   confirm payments.
5. **Honest states**: features needing credentials (LiveKit, Paystack, Stripe, email) show an
   explicit "not configured" state instead of pretending to work.

## 3. Personas and experiences

| Experience | Who | Entry point |
| --- | --- | --- |
| Public visitor | Prospective organisations, donors | `/`, `/pricing`, `/c/{slug}`, `/c/{slug}/give/{campaign}` |
| Member | Registered user belonging to ≥1 organisation | `/app`, `/o/{slug}` |
| Community administrator | Owner, Admin, Moderator, Prayer Coordinator, Host | `/o/{slug}/admin` |
| Finance administrator | Finance Admin, Owner | `/o/{slug}/finance` |
| Platform administrator | BridgeCodes staff | `/platform` |

## 4. Functional scope

### 4.1 Organisations and membership
- Organisation registration: name, slug, description, country, time zone, language, default
  currency, contact details, website/social links, visibility (public listing or unlisted),
  join policy (open, approval, invitation only), terms/privacy acknowledgement.
- Logo and cover image upload (validated images; no SVG).
- Verification status (`UNVERIFIED`, `PENDING`, `VERIFIED`, `REJECTED`) set by platform admins.
- Invitations by email with hashed, single-use, expiring tokens and pre-assigned roles.
- Join requests with approval, member suspension/removal, voluntary leave.
- Roles per membership (one person may hold different roles in different organisations):
  `OWNER`, `ADMIN`, `MODERATOR`, `PRAYER_COORDINATOR`, `HOST`, `FINANCE_ADMIN`, `MEMBER`.
  See `docs/SECURITY.md` for the permission matrix.
- Standard public URL `/c/{slug}`. Custom domains are a planned premium capability.

### 4.2 Groups
Community groups (e.g. "Monday Intercessors") with leaders and members. Groups scope meetings,
announcements, prayer-request visibility and programmes.

### 4.3 Meetings
- Modes: `WHATSAPP` (external link + instructions), `AUDIO` (in-app), `VIDEO` (in-app).
- Formats for in-app rooms: `INTERACTIVE` (everyone may speak unless restricted) and
  `BROADCAST` (only hosts/approved speakers publish — suitable for large prayer lines).
- Recurrence: one-time, daily, weekly on selected weekdays, with interval and end date. The
  intended local time and IANA time zone are stored; occurrences are materialised in UTC.
- Per-occurrence cancellation and rescheduling; ICS calendar export.
- Agenda items, prayer theme, scripture references, host/co-host assignment.
- Visibility: public, all members, a group, or specific invitees.
- Live session: secure short-lived tokens, participant list, mute/unmute, raise hand, speaker
  grants, waiting room (admission), removal, lock, connection state, reconnection, attendance via
  provider webhooks, prayer-agenda side panel, optional chat, screen sharing in video mode,
  free virtual gifts.
- WhatsApp: "Join on WhatsApp" with an interstitial explaining the member is leaving the
  platform. Clicks are recorded as *join intents*, **never** as attendance. Hosts may record
  attendance manually (marked as host-reported).
- Recording is **not** implemented and is off by design.

### 4.4 Community content
- Announcements (draft/published, pinned, whole org or a group).
- Daily prayer points with scripture references.
- Prayer requests: private / group / organisation visibility, anonymity (if the organisation
  allows), moderation, assignment to prayer-team members, "I prayed" acknowledgements,
  author updates, answered status, follow-up reminders, reporting.
- Testimonies: consent-based, moderated, members-only or public (public requires explicit
  consent). Never generated automatically from prayer requests.
- Content reports and moderation queue.

### 4.5 Programmes
Bible studies, prayer challenges, devotionals, fasting programmes, reading plans, reflection
series and mentorship programmes with daily activities, scripture references, resource links,
reflection questions, enrolment and completion tracking. Draft/published workflow. AI-assisted
drafting is **planned**, and would always produce drafts requiring human approval.

### 4.6 Fundraising (community-owned)
- Provider adapters: **Paystack** (split payments to a per-organisation subaccount; Nigeria and
  other Paystack markets) and **Stripe Connect** (direct charges on the organisation's own
  connected account; international). A local **simulator** exists for development and automated
  tests only and is refused when `APP_ENV=production`.
- Connection states: `NOT_CONFIGURED`, `ONBOARDING_REQUIRED`, `PENDING_VERIFICATION`, `VERIFIED`,
  `RESTRICTED`, `DISCONNECTED`. Live donations require `VERIFIED` and provider-reported charge
  capability.
- Campaigns with purpose, target, currency, dates, visibility, suggested amounts, anonymous
  option, terms; publication requires approval by a user with `finance.manage`.
- Donation checkout through provider-hosted pages; amount, currency and recipient are derived
  on the server.
- Ledger with distinct gross, processing fee, platform fee, refunds, net and settled amounts.
- Receipts, donor history, finance reports, CSV export, refunds, disputes, reconciliation.

### 4.7 Virtual gifts
Configurable gifts (name, emoji/icon, order, availability, show in feed). Free gifts are
implemented with server-authored broadcast to the room, so clients cannot spoof gift events.
Paid gifts use the same provider checkout, are recorded separately from donations, and are
disabled unless explicitly enabled per organisation. There is no virtual currency.

### 4.8 Subscriptions
Plans `FREE`, `COMMUNITY`, `GROWTH`, `MINISTRY`, `ENTERPRISE` with configurable entitlements
(feature flags and numeric limits stored in `PlanEntitlement`). Server-side enforcement of every
entitlement. Subscription states, trials, grace periods, cancellation at period end, billing
history. Billing provider: Stripe Billing when configured; otherwise an explicit "billing not
configured" state and platform-admin manual plan assignment (audited). Subscription payments and
donations live in **separate tables**.

### 4.9 Notifications
In-app notifications and email (outbox with retries). Per-category preferences and one-click
email unsubscribe. Meeting reminders, cancellations, reschedules, announcements, prayer follow-ups,
programme activity, donation receipts. Browser push and WhatsApp Business are **planned**.

### 4.10 Platform administration
Organisation list and status, suspension, verification, plan management, manual plan
assignment, payment-connection reviews, support requests, provider health, platform audit log.
No access path to prayer requests or other confidential community content.

### 4.11 Privacy
Data export (JSON) and account deletion (anonymisation, with financial records retained as
required). Draft legal documents (privacy policy, terms, community guidelines, fundraising
disclosures) are marked **draft — requires legal review**.

## 5. Acceptance workflow mapping

See `docs/IMPLEMENTATION_PLAN.md` § "Acceptance criteria status" for the live status of each of
the 27 acceptance steps.

## 6. Out of scope for the initial release
Custom domains, native mobile apps, meeting recording, browser push, WhatsApp Business API,
AI-assisted drafting, multi-branch hierarchies, recurring donations (schema-ready, not wired).
