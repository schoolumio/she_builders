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

async function cleanup(now: Date) {
  const [sessions, tokens, buckets] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.authToken.deleteMany({ where: { expiresAt: { lt: DateTime.fromJSDate(now).minus({ days: 7 }).toJSDate() } } }),
    db.rateLimitBucket.deleteMany({ where: { windowStart: { lt: DateTime.fromJSDate(now).minus({ days: 1 }).toJSDate() } } }),
  ]);
  return sessions.count + tokens.count + buckets.count;
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
