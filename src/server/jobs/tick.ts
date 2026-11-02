import "server-only";
import { DateTime } from "luxon";
import { db } from "../db";
import { errorMeta, log } from "../log";
import { retryPendingEmails } from "../email";
import { materializeAllMeetings, meetingAudience } from "../meetings/service";
import { sendPrayerFollowUps } from "../prayer/service";
import { expireSubscriptions } from "../billing/service";
import { notify } from "../notifications";
import { formatInZone } from "@/lib/time";

const REMINDERS = [
  { kind: "24h", minutesBefore: 24 * 60, email: true },
  { kind: "15m", minutesBefore: 15, email: false },
] as const;

/** Sends each reminder once per occurrence per user (unique MeetingReminderLog). */
export async function sendMeetingReminders(now = new Date()) {
  let sent = 0;
  for (const r of REMINDERS) {
    const windowStart = DateTime.fromJSDate(now).plus({ minutes: r.minutesBefore - 10 }).toJSDate();
    const windowEnd = DateTime.fromJSDate(now).plus({ minutes: r.minutesBefore + 5 }).toJSDate();
    const occs = await db.meetingOccurrence.findMany({
      where: { status: "SCHEDULED", startsAt: { gte: windowStart, lte: windowEnd }, meeting: { status: "ACTIVE" } },
      include: { meeting: true, organization: { select: { slug: true, name: true } } },
    });
    for (const occ of occs) {
      const audience = await meetingAudience(occ.meetingId);
      const already = await db.meetingReminderLog.findMany({ where: { occurrenceId: occ.id, kind: r.kind }, select: { userId: true } });
      const done = new Set(already.map((a) => a.userId));
      const todo = audience.filter((u) => !done.has(u));
      if (!todo.length) continue;
      await db.meetingReminderLog.createMany({ data: todo.map((userId) => ({ occurrenceId: occ.id, userId, kind: r.kind })), skipDuplicates: true });
      await notify({
        userIds: todo,
        organizationId: occ.organizationId,
        category: "MEETINGS",
        title: `${r.kind === "24h" ? "Tomorrow" : "Starting soon"}: ${occ.meeting.title}`,
        body: `${formatInZone(occ.startsAt, occ.meeting.timezone)} (${occ.meeting.timezone}) · ${occ.organization.name}`,
        link: `/o/${occ.organization.slug}/meetings/${occ.id}`,
        email: r.email,
      });
      sent += todo.length;
    }
  }
  return sent;
}

/** Retention periods in days (see docs/DATABASE.md). Financial records are never purged here. */
export const RETENTION_DAYS = {
  authTokens: 7,
  rateLimitBuckets: 1,
  emailOutbox: 30, // sent or permanently failed messages (contain notification text)
  readNotifications: 180,
  joinIntents: 365,
  realtimeEvents: 90,
  simulatorRecords: 30,
  auditLog: Number(process.env.AUDIT_RETENTION_DAYS ?? 730),
};

/** Deletes expired security records and data past its retention period. Returns rows removed. */
export async function cleanup(now: Date) {
  const before = (days: number) => DateTime.fromJSDate(now).minus({ days }).toJSDate();
  const results = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.authToken.deleteMany({ where: { expiresAt: { lt: before(RETENTION_DAYS.authTokens) } } }),
    db.rateLimitBucket.deleteMany({ where: { windowStart: { lt: before(RETENTION_DAYS.rateLimitBuckets) } } }),
    db.emailOutbox.deleteMany({ where: { status: { in: ["SENT", "FAILED"] }, createdAt: { lt: before(RETENTION_DAYS.emailOutbox) } } }),
    db.notification.deleteMany({ where: { readAt: { not: null }, createdAt: { lt: before(RETENTION_DAYS.readNotifications) } } }),
    db.meetingJoinIntent.deleteMany({ where: { createdAt: { lt: before(RETENTION_DAYS.joinIntents) } } }),
    db.realtimeWebhookEvent.deleteMany({ where: { receivedAt: { lt: before(RETENTION_DAYS.realtimeEvents) } } }),
    db.simulatorRecord.deleteMany({ where: { updatedAt: { lt: before(RETENTION_DAYS.simulatorRecords) } } }),
    db.auditLog.deleteMany({ where: { createdAt: { lt: before(RETENTION_DAYS.auditLog) } } }),
  ]);
  return results.reduce((s, r) => s + r.count, 0);
}

/** Idempotent scheduled work. Safe to run every 5 minutes from cron or a platform scheduler. */
export async function runScheduledTick(now = new Date()) {
  const results: Record<string, number | string> = {};
  const steps: [string, () => Promise<number>][] = [
    ["occurrencesCreated", () => materializeAllMeetings(now)],
    ["remindersSent", () => sendMeetingReminders(now)],
    ["prayerFollowUps", () => sendPrayerFollowUps(now)],
    ["emailsRetried", () => retryPendingEmails()],
    ["subscriptionsChanged", () => expireSubscriptions(now)],
    ["rowsCleaned", () => cleanup(now)],
  ];
  for (const [name, fn] of steps) {
    try {
      results[name] = await fn();
    } catch (e) {
      log.error("tick.step_failed", { step: name, ...errorMeta(e) });
      results[name] = "error";
    }
  }
  log.info("tick.completed", results);
  return results;
}
