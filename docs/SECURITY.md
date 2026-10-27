# Security and Privacy

This platform stores private spiritual communications, personal data and financial records for
many independent organisations. It is treated as security-sensitive throughout.

## 1. Threat model (summary)

| Threat | Mitigation |
| --- | --- |
| Cross-tenant data access (IDOR, tampered org ids) | Slug → membership resolution on the server; every query filters by `organizationId` and object id; tenant-isolation integration tests. |
| Privilege escalation inside an organisation | Server-enforced permission sets; only owners assign sensitive roles; admins may only grant `MODERATOR`/`HOST`; owners cannot be demoted except by ownership transfer; audit log. |
| Over-broad admin access to prayer requests | `prayer.view_confidential` belongs only to `PRAYER_COORDINATOR`. Owners/admins must explicitly take that role (audited). Platform admins have no access path. |
| Payment tampering (amount, currency, recipient, status) | Server-derived checkout parameters; webhook signature verification; amount/currency/account re-verification; idempotent event store; state machine; redirect pages read the DB only. |
| Spoofed gift / room events | Gifts are sent through an authenticated API and broadcast by the server; clients render gift messages only when they originate from the server (no participant identity). |
| Unauthorised meeting access | Short-lived LiveKit tokens issued only after membership, visibility, status, time-window, lock, ban and admission checks. Provider secret is server-only. |
| Account takeover | scrypt hashing, rate-limited login/reset, generic errors, hashed single-use tokens, session rotation on login and password change, revocation of all sessions on reset. |
| CSRF | Server actions (Next.js origin check); route handlers that mutate state check `Origin`; `SameSite=Lax` cookies. Webhooks authenticate by signature instead. |
| XSS | React escaping; no `dangerouslySetInnerHTML` for user content; strict CSP; external links validated (`https:` only, plus `wa.me`/`chat.whatsapp.com` allow-list for WhatsApp links) and opened with `rel="noopener noreferrer"`. |
| Malicious uploads | Images only (PNG/JPEG/WebP), magic-byte sniffing, 2 MB limit, random file names, SVG refused, private and public prefixes separated. |
| Secrets leakage | Secrets only in server env; `server-only` imports; structured logger redacts sensitive keys; provider errors are mapped to generic messages. |
| Abuse / spam | DB-backed rate limits on auth, invitations, prayer requests, gifts, donations; content reports; moderation queues. |

## 2. Roles and permissions

Roles are per membership; a person can be an owner in one organisation and a member in another.
Platform roles (`SUPER_ADMIN`, `SUPPORT`) grant **no** organisation permissions.

| Permission | OWNER | ADMIN | MODERATOR | PRAYER_COORD. | HOST | FINANCE_ADMIN | MEMBER |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `org.settings` | ✔ | ✔ | | | | | |
| `members.view` | ✔ | ✔ | ✔ | ✔ | ✔ | | |
| `members.manage` (invite, approve, suspend) | ✔ | ✔ | | | | | |
| `roles.assign` (any role) | ✔ | | | | | | |
| `roles.assign_limited` (MODERATOR, HOST) | ✔ | ✔ | | | | | |
| `groups.manage` | ✔ | ✔ | | | | | |
| `meetings.manage` (all meetings) | ✔ | ✔ | | | | | |
| `meetings.create` | ✔ | ✔ | | | ✔ | | |
| `content.publish` (announcements, prayer points) | ✔ | ✔ | | ✔ | | | |
| `content.moderate` (testimonies, reports) | ✔ | ✔ | ✔ | | | | |
| `prayer.moderate` (shared requests only) | ✔ | ✔ | ✔ | ✔ | | | |
| `prayer.view_confidential` (private requests) | | | | ✔ | | | |
| `prayer.assign` | | | | ✔ | | | |
| `programmes.manage` | ✔ | ✔ | | | | | |
| `gifts.manage` | ✔ | ✔ | | | | | |
| `campaigns.draft` | ✔ | ✔ | | | | ✔ | |
| `finance.view` (reports, donations) | ✔ | | | | | ✔ | |
| `finance.manage` (accounts, publish campaigns, refunds) | ✔ | | | | | ✔ | |
| `billing.manage` | ✔ | | | | | | |
| `billing.view` | ✔ | ✔ | | | | ✔ | |
| `audit.view` | ✔ | ✔ | | | | | |

Hosts manage only meetings where they are an assigned host (object-level check).
Members always may: view published content, view meetings visible to them, submit/manage their
own prayer requests and testimonies, view their own donations, leave the organisation.

### Prayer-request visibility rules (`src/server/prayer/access.ts`)
- **Author**: always.
- **PRIVATE**: author, prayer coordinators, and members explicitly assigned by a coordinator.
- **GROUP**: active members of that group once approved; moderators/coordinators (incl. pending).
- **ORGANIZATION**: all active members once approved; moderators/coordinators (incl. pending).
- **Anonymous** requests hide the author identity from everyone except the author.
- Platform administrators: no access.

## 3. Authentication and sessions
- Passwords: `scrypt` (N=2^15, r=8, p=3, 32-byte key, 16-byte salt), parameters stored with the
  hash for future upgrades; minimum 10 characters.
- Sessions: 32 random bytes, base64url, cookie `pcp_session`; DB stores only SHA-256(token).
  30-day sliding expiry, refreshed when < 15 days remain. Logout and password reset delete
  sessions.
- Email verification and password reset tokens: 32 random bytes, stored hashed, single use,
  1 hour (reset) / 48 hours (verify) expiry.
- Invitations: hashed tokens, 14-day expiry, single use, bound to the invited email address.
- Login and reset endpoints return generic messages and are rate limited per IP and per email.

## 4. Financial data
- No storage of card data, CVCs, online-banking passwords, PINs or provider secret keys for
  organisations. Organisations connect through provider-hosted onboarding (Stripe) or via a
  server-side call to the provider (Paystack) where the full account number transits the server
  once and only the last four digits, bank name and provider subaccount code are stored.
- Donation ledger entries are append-only (no update/delete code paths); corrections are new
  entries.
- Finance reports are visible only with `finance.view`.

## 5. Logging
`src/server/log.ts` redacts keys matching password, token, secret, authorization, cookie,
account_number, body/content of prayer requests. Prayer-request text is never logged.

## 6. Data protection
- Data export: `GET /api/me/export` (JSON, own data only).
- Account deletion: profile anonymised, sessions removed, memberships ended, own prayer requests
  and testimonies deleted; donation records are retained for financial record-keeping with the
  donor detached and anonymised.
- AI: confidential prayer requests are never sent to third-party AI providers. No AI
  integration exists in this release.
- Legal drafts (`/privacy`, `/terms`, `/guidelines`, `/fundraising-disclosures`) are drafts
  requiring legal review. Their existence is not a claim of compliance.

## 7. Platform administrator access
Platform admins can view organisation metadata, plans, payment-connection statuses, support
requests and platform audit events. They cannot read prayer requests, testimonies awaiting
moderation, member messages or donor personal data through the platform UI. Any future
exceptional-access ("break-glass") tooling must be scoped to a single organisation and record a
justification in the audit log; it is intentionally **not** implemented.

## 8. Reporting vulnerabilities
Report to the BridgeCodes security contact configured in `SECURITY_CONTACT_EMAIL`.

## 9. Dependency hygiene
`npm audit` must be clean before release; Prisma's transitive `deepmerge-ts` is overridden to a
patched version (`package.json#overrides`).
