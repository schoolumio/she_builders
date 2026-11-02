# Meetings

## Modes
| Mode | Where it happens | Attendance |
| --- | --- | --- |
| `WHATSAPP` | WhatsApp (external link + instructions) | Host-marked only. "Join on WhatsApp" clicks are stored as `MeetingJoinIntent` and are **not** attendance. |
| `AUDIO` | In-app LiveKit room, microphone only | Automatic from LiveKit `participant_joined`/`participant_left` webhooks |
| `VIDEO` | In-app LiveKit room, camera + microphone, hosts may screen share | Automatic, as above |

WhatsApp links are validated (https only, WhatsApp hosts) and classified: `chat.whatsapp.com` is a
**group invite** (opens the chat, not a call); `call.whatsapp.com` is a **call link**. Members see an
interstitial explaining they are leaving the platform. There is no WhatsApp scraping or unofficial
API use. WhatsApp Business API notifications are a future capability.

## Scheduling
`Meeting` stores the local start date/time, duration, IANA time zone and recurrence (`NONE`,
`DAILY` with interval, `WEEKLY` with ISO weekdays and interval, optional end date).
`expandRecurrence` (`src/server/meetings/recurrence.ts`, unit tested across DST) produces UTC slots;
`MeetingOccurrence` rows are materialised 90 days ahead (one-time meetings regardless of date) and
extended by the scheduler. Each occurrence can be cancelled or rescheduled individually; editing a
series' schedule regenerates untouched future occurrences. Members get in-app + email
notifications for cancellations and changes and reminders 24h and 15m before. Calendar export:
`/api/orgs/{slug}/calendar.ics` (one VEVENT per occurrence, UTC times).

## Formats
- `INTERACTIVE`: everyone may publish their microphone (and camera in video mode). Hosts can mute,
  revoke speaking, or remove participants.
- `BROADCAST` ("prayer line"): only hosts/co-hosts and members granted speaking publish. Listeners
  raise hands; hosts grant/revoke speaking. Use this for large sessions.

**Large audiences.** An interactive SFU room is not the most economical way to serve thousands of
passive listeners. The documented path for very large events is LiveKit Egress to HLS/RTMP (e.g.
YouTube Live or an HLS CDN) with the interactive room limited to hosts. Egress is **not
implemented** in this release. Plan limits cap participants per room (`limit.room_participants`).

## Room security (`src/server/meetings/room.ts`)
A token is issued by `POST /api/orgs/{slug}/occurrences/{id}/room {op:"token"}` only when:
1. the user has a session and an ACTIVE membership in the organisation (from the slug, never a client-supplied org id);
2. the meeting is visible to them (members / group / invitees / hosts);
3. the mode is AUDIO/VIDEO and the plan includes it;
4. the occurrence is not cancelled/ended and is within its join window (15 min early, 30 for hosts);
5. the room is not locked (hosts excepted) and the user was not removed from this session;
6. waiting room: the user has been admitted by a host.

Tokens are short-lived (10 minutes to connect; LiveKit refreshes connected sessions), scoped to one
room, `canUpdateOwnMetadata: false`, and carry per-role publish permissions (`canPublishSources`).
Host actions (mute, allow/revoke speaking, lower hand, remove, admit/deny, lock, end) are server API
calls that check host rights and then call LiveKit's server API. Removal also revokes tokens issued
before that moment. Chat (if enabled) uses LiveKit data messages and is not stored. Gifts and system
events are sent by the server; the client renders them only when they have no participant sender.
**Recording is not implemented and never on by default.** Adding it requires consent capture.

## Provider abstraction
`RealtimeProvider` (`src/server/realtime/provider.ts`): `isConfigured`, `clientUrl`,
`createAccessToken`, `ensureRoom`, `updateParticipant`, `muteMicrophone`, `removeParticipant`,
`sendServerData`, `closeRoom`, `verifyWebhook`. `LiveKitProvider` uses `livekit-server-sdk`
(official). Tests use an in-memory fake. Swapping provider = implementing this interface.

## Configuring LiveKit
1. Create a LiveKit Cloud project (or self-host LiveKit server). Pick a region near your members.
2. Set `LIVEKIT_URL` (`wss://<project>.livekit.cloud`), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
3. In LiveKit → Settings → Webhooks add `https://<APP_URL>/api/webhooks/livekit` (signed with the
   API key/secret). Required for attendance, live/ended status and usage minutes.
4. The CSP automatically allows the LiveKit origin (and `*.livekit.cloud`) for `connect-src`.
5. Verify: join a meeting from two browsers; check `MeetingAttendance` rows after leaving.

Without these variables, in-app meetings show "not configured" and no tokens are issued.

## Usage tracking
Participant minutes are accumulated from leave events into `UsageRecord` (`meeting.participant_minutes`,
per month) and shown on the billing page. Compare with the LiveKit dashboard for cost control.

## Known limitations
- Live chat is ephemeral; there is no persistent meeting chat history.
- The raise-hand queue relies on participant attributes and the host panel polls every 5 seconds.
- End-to-end automated tests cover token issuance and host controls through a fake provider; a real
  LiveKit call must be tested manually once credentials exist.
