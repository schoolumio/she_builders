import "server-only";
import type { Meeting, MeetingOccurrence, Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { z } from "zod";
import { db } from "../db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { parseInput } from "../validate";
import { audit } from "../audit";
import { randomToken } from "../crypto";
import { notify } from "../notifications";
import { assertFeature, assertWithinLimit } from "../billing/entitlements";
import type { OrgContext } from "../tenancy/context";
import { can, requireActiveOrg, requirePermission } from "../tenancy/context";
import { myGroupIds } from "../groups/service";
import { canManageMeeting, canViewMeeting, type MeetingAccessFacts } from "./access";
import { expandRecurrence } from "./recurrence";
import { checkbox, dateString, optionalText, scriptureList, timeString, timezoneSchema } from "@/lib/validation";
import { safeExternalUrl } from "@/lib/urls";

export const MATERIALIZE_DAYS = 90;

const arrayOf = <T extends z.ZodType>(s: T) =>
  z
    .union([z.array(s), s])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]) as z.output<T>[]);

export const meetingSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    description: optionalText(4000),
    theme: optionalText(200),
    scriptureRefs: scriptureList,
    mode: z.enum(["WHATSAPP", "AUDIO", "VIDEO"]),
    format: z.enum(["INTERACTIVE", "BROADCAST"]).default("INTERACTIVE"),
    visibility: z.enum(["PUBLIC", "MEMBERS", "GROUP", "INVITED"]),
    groupId: optionalText(40),
    externalUrl: optionalText(500),
    externalInstructions: optionalText(2000),
    waitingRoom: checkbox,
    attendancePrivate: checkbox,
    chatEnabled: checkbox,
    giftsEnabled: checkbox,
    timezone: timezoneSchema,
    startDate: dateString,
    startTime: timeString,
    durationMinutes: z.coerce.number().int().min(10).max(12 * 60),
    frequency: z.enum(["NONE", "DAILY", "WEEKLY"]),
    interval: z.coerce.number().int().min(1).max(12).default(1),
    byWeekday: arrayOf(z.coerce.number().int().min(1).max(7)),
    untilDate: z
      .string()
      .optional()
      .transform((v) => v || undefined)
      .pipe(dateString.optional()),
    hostIds: arrayOf(z.string().max(40)),
    coHostIds: arrayOf(z.string().max(40)),
    inviteeIds: arrayOf(z.string().max(40)),
    agenda: optionalText(5000), // one item per line: "Title | details | scripture | minutes"
  })
  .superRefine((d, ctx) => {
    if (d.mode === "WHATSAPP") {
      if (!d.externalUrl && !d.externalInstructions) {
        ctx.addIssue({ code: "custom", path: ["externalUrl"], message: "Add a WhatsApp link or joining instructions." });
      }
      if (d.externalUrl && !safeExternalUrl(d.externalUrl)) {
        ctx.addIssue({ code: "custom", path: ["externalUrl"], message: "Use a secure https:// link." });
      }
    }
    if (d.visibility === "GROUP" && !d.groupId) ctx.addIssue({ code: "custom", path: ["groupId"], message: "Choose a group." });
    if (d.frequency === "WEEKLY" && d.byWeekday.length === 0) {
      ctx.addIssue({ code: "custom", path: ["byWeekday"], message: "Choose at least one weekday." });
    }
    if (d.untilDate && d.untilDate < d.startDate) ctx.addIssue({ code: "custom", path: ["untilDate"], message: "End date must be after the start date." });
  });

export type MeetingInput = z.output<typeof meetingSchema>;

function parseAgenda(text?: string) {
  if (!text) return [];
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 40)
    .map((line, position) => {
      const [title, details, scriptureRef, minutes] = line.split("|").map((s) => s.trim());
      const durationMinutes = minutes ? Number.parseInt(minutes, 10) : NaN;
      return {
        position,
        title: (title || "Agenda item").slice(0, 200),
        details: details?.slice(0, 1000) || null,
        scriptureRef: scriptureRef?.slice(0, 200) || null,
        durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
      };
    });
}

export async function accessFacts(ctx: OrgContext): Promise<MeetingAccessFacts> {
  return { userId: ctx.actor.id, canManageAll: can(ctx, "meetings.manage"), groupIds: await myGroupIds(ctx.org.id, ctx.actor.id) };
}

async function assertMeetingEntitlements(ctx: OrgContext, data: MeetingInput) {
  if (data.mode === "AUDIO") await assertFeature(ctx.org.id, "feature.in_app_audio");
  if (data.mode === "VIDEO") await assertFeature(ctx.org.id, "feature.in_app_video");
  if (data.frequency !== "NONE") await assertFeature(ctx.org.id, "feature.recurring_meetings");
}

async function validatePeople(ctx: OrgContext, data: MeetingInput) {
  const ids = [...new Set([...data.hostIds, ...data.coHostIds, ...data.inviteeIds])];
  if (ids.length) {
    const count = await db.membership.count({ where: { organizationId: ctx.org.id, status: "ACTIVE", userId: { in: ids } } });
    if (count !== ids.length) throw new ValidationError("Hosts and invitees must be active members of this community.");
  }
  if (data.groupId) {
    const g = await db.communityGroup.findFirst({ where: { id: data.groupId, organizationId: ctx.org.id, archivedAt: null } });
    if (!g) throw new ValidationError("Choose a valid group.", { groupId: "Group not found." });
  }
}

function meetingData(data: MeetingInput) {
  return {
    title: data.title,
    description: data.description ?? null,
    theme: data.theme ?? null,
    scriptureRefs: data.scriptureRefs,
    mode: data.mode,
    format: data.format,
    visibility: data.visibility,
    groupId: data.visibility === "GROUP" ? data.groupId! : null,
    externalUrl: data.mode === "WHATSAPP" ? (safeExternalUrl(data.externalUrl) ?? null) : null,
    externalInstructions: data.mode === "WHATSAPP" ? (data.externalInstructions ?? null) : null,
    waitingRoom: data.waitingRoom,
    attendancePrivate: data.attendancePrivate,
    chatEnabled: data.chatEnabled,
    giftsEnabled: data.giftsEnabled,
    timezone: data.timezone,
    startDate: data.startDate,
    startTime: data.startTime,
    durationMinutes: data.durationMinutes,
    frequency: data.frequency,
    interval: data.interval,
    byWeekday: data.frequency === "WEEKLY" ? [...new Set(data.byWeekday)].sort() : [],
    untilDate: data.frequency === "NONE" ? null : (data.untilDate ?? null),
  } satisfies Partial<Prisma.MeetingUncheckedCreateInput>;
}

function hostRows(data: MeetingInput, creatorId: string, creatorIsHostOnly: boolean) {
  const hosts = new Map<string, "HOST" | "CO_HOST">();
  for (const id of data.coHostIds) hosts.set(id, "CO_HOST");
  for (const id of data.hostIds) hosts.set(id, "HOST");
  // A host-role member who creates a meeting always hosts it (otherwise they could not manage it).
  if (creatorIsHostOnly || hosts.size === 0) hosts.set(creatorId, "HOST");
  return [...hosts.entries()].map(([userId, role]) => ({ userId, role }));
}

export async function createMeeting(ctx: OrgContext, input: unknown) {
  requirePermission(ctx, "meetings.create");
  requireActiveOrg(ctx);
  const data = parseInput(meetingSchema, input);
  await assertMeetingEntitlements(ctx, data);
  await assertWithinLimit(ctx.org.id, "limit.active_meetings", await db.meeting.count({ where: { organizationId: ctx.org.id, status: "ACTIVE" } }));
  await validatePeople(ctx, data);
  const meeting = await db.$transaction(async (tx) => {
    const m = await tx.meeting.create({
      data: {
        ...meetingData(data),
        organizationId: ctx.org.id,
        createdById: ctx.actor.id,
        hosts: { create: hostRows(data, ctx.actor.id, !can(ctx, "meetings.manage")) },
        invitees: { create: [...new Set(data.inviteeIds)].map((userId) => ({ userId })) },
        agendaItems: { create: parseAgenda(data.agenda) },
      },
    });
    await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "meeting.created", targetType: "Meeting", targetId: m.id, metadata: { mode: m.mode } }, tx);
    return m;
  });
  await materializeOccurrences(meeting.id);
  return meeting;
}

export async function loadMeetingForManage(ctx: OrgContext, meetingId: string) {
  const meeting = await db.meeting.findFirst({
    where: { id: meetingId, organizationId: ctx.org.id },
    include: { hosts: true, invitees: true, agendaItems: { orderBy: { position: "asc" } } },
  });
  if (!meeting) throw new NotFoundError("Meeting not found.");
  if (!canManageMeeting(meeting, await accessFacts(ctx))) throw new ForbiddenError("Only this meeting's hosts or administrators can change it.");
  return meeting;
}

export async function updateMeeting(ctx: OrgContext, meetingId: string, input: unknown) {
  requireActiveOrg(ctx);
  const existing = await loadMeetingForManage(ctx, meetingId);
  const data = parseInput(meetingSchema, input);
  await assertMeetingEntitlements(ctx, data);
  await validatePeople(ctx, data);
  const fields = meetingData(data);
  const scheduleChanged = (["timezone", "startDate", "startTime", "durationMinutes", "frequency", "interval", "untilDate"] as const).some(
    (k) => String(existing[k] ?? "") !== String(fields[k] ?? ""),
  ) || existing.byWeekday.join(",") !== fields.byWeekday.join(",");

  await db.$transaction(async (tx) => {
    await tx.meeting.update({ where: { id: existing.id }, data: { ...fields, ...(scheduleChanged ? { materializedUntil: null } : {}) } });
    // Only administrators may change the host list; hosts keep themselves.
    if (can(ctx, "meetings.manage")) {
      await tx.meetingHost.deleteMany({ where: { meetingId: existing.id } });
      await tx.meetingHost.createMany({ data: hostRows(data, ctx.actor.id, false).map((h) => ({ ...h, meetingId: existing.id })) });
    }
    await tx.meetingInvitee.deleteMany({ where: { meetingId: existing.id } });
    await tx.meetingInvitee.createMany({ data: [...new Set(data.inviteeIds)].map((userId) => ({ userId, meetingId: existing.id })) });
    await tx.meetingAgendaItem.deleteMany({ where: { meetingId: existing.id } });
    await tx.meetingAgendaItem.createMany({ data: parseAgenda(data.agenda).map((a) => ({ ...a, meetingId: existing.id })) });
    if (scheduleChanged) {
      // Drop future, untouched occurrences; they are regenerated from the new rule below.
      await tx.meetingOccurrence.deleteMany({
        where: { meetingId: existing.id, status: "SCHEDULED", rescheduled: false, startsAt: { gt: new Date() }, attendances: { none: {} } },
      });
    }
    await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "meeting.updated", targetType: "Meeting", targetId: existing.id, metadata: { scheduleChanged } }, tx);
  });
  await materializeOccurrences(existing.id);
  if (scheduleChanged) {
    await notifyAudience(ctx, existing.id, `Schedule changed: ${data.title}`, "The meeting schedule has been updated. Please check the new times.");
  }
}

/** Ensures occurrences exist up to MATERIALIZE_DAYS ahead. Idempotent. */
export async function materializeOccurrences(meetingId: string, now = new Date()) {
  const meeting = await db.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting || meeting.status !== "ACTIVE") return 0;
  const horizon = DateTime.fromJSDate(now).plus({ days: MATERIALIZE_DAYS }).toJSDate();
  if (meeting.materializedUntil && meeting.materializedUntil >= DateTime.fromJSDate(horizon).minus({ days: 1 }).toJSDate()) return 0;
  const from = DateTime.fromJSDate(now).minus({ days: 1 }).toJSDate();
  // One-time meetings are materialised however far ahead they are scheduled.
  const to = meeting.frequency === "NONE" ? DateTime.fromJSDate(now).plus({ years: 10 }).toJSDate() : horizon;
  const slots = expandRecurrence(
    { ...meeting, frequency: meeting.frequency, byWeekday: meeting.byWeekday, untilDate: meeting.untilDate },
    from,
    to,
  );
  if (slots.length) {
    await db.meetingOccurrence.createMany({
      data: slots.map((s) => ({
        organizationId: meeting.organizationId,
        meetingId: meeting.id,
        originalStartsAt: s.startsAt,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        roomName: `pcp_${randomToken(16)}`,
      })),
      skipDuplicates: true,
    });
  }
  await db.meeting.update({ where: { id: meeting.id }, data: { materializedUntil: horizon } });
  return slots.length;
}

export async function materializeAllMeetings(now = new Date()) {
  const meetings = await db.meeting.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  let created = 0;
  for (const m of meetings) created += await materializeOccurrences(m.id, now);
  return created;
}

async function audienceUserIds(meeting: Meeting & { hosts: { userId: string }[]; invitees: { userId: string }[] }) {
  if (meeting.visibility === "INVITED") return [...new Set([...meeting.invitees.map((i) => i.userId), ...meeting.hosts.map((h) => h.userId)])];
  if (meeting.visibility === "GROUP" && meeting.groupId) {
    const rows = await db.groupMembership.findMany({ where: { groupId: meeting.groupId }, select: { userId: true } });
    return [...new Set([...rows.map((r) => r.userId), ...meeting.hosts.map((h) => h.userId)])];
  }
  const rows = await db.membership.findMany({ where: { organizationId: meeting.organizationId, status: "ACTIVE" }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

export async function meetingAudience(meetingId: string) {
  const meeting = await db.meeting.findUniqueOrThrow({ where: { id: meetingId }, include: { hosts: true, invitees: true } });
  return audienceUserIds(meeting);
}

async function notifyAudience(ctx: OrgContext, meetingId: string, title: string, body: string, occurrenceId?: string) {
  const userIds = await meetingAudience(meetingId);
  await notify({
    userIds,
    organizationId: ctx.org.id,
    category: "MEETINGS",
    title,
    body,
    link: occurrenceId ? `/o/${ctx.org.slug}/meetings/${occurrenceId}` : `/o/${ctx.org.slug}/meetings`,
    email: true,
  });
}

export async function cancelMeetingSeries(ctx: OrgContext, meetingId: string, reason?: string) {
  const meeting = await loadMeetingForManage(ctx, meetingId);
  await db.$transaction([
    db.meeting.update({ where: { id: meeting.id }, data: { status: "CANCELLED" } }),
    db.meetingOccurrence.updateMany({
      where: { meetingId: meeting.id, status: "SCHEDULED", startsAt: { gt: new Date() } },
      data: { status: "CANCELLED", cancelReason: reason?.slice(0, 500) ?? null },
    }),
  ]);
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "meeting.cancelled", targetType: "Meeting", targetId: meeting.id });
  await notifyAudience(ctx, meeting.id, `Cancelled: ${meeting.title}`, reason ? `Reason: ${reason}` : "All upcoming sessions of this meeting have been cancelled.");
}

async function loadOccurrence(ctx: OrgContext, occurrenceId: string) {
  const occ = await db.meetingOccurrence.findFirst({
    where: { id: occurrenceId, organizationId: ctx.org.id },
    include: { meeting: { include: { hosts: true, invitees: true, agendaItems: { orderBy: { position: "asc" } }, group: true } } },
  });
  if (!occ) throw new NotFoundError("Meeting not found.");
  return occ;
}

export type OccurrenceWithMeeting = Awaited<ReturnType<typeof loadOccurrence>>;

/** Loads an occurrence the actor is allowed to see. Invisible meetings look like they don't exist. */
export async function getOccurrenceForMember(ctx: OrgContext, occurrenceId: string) {
  const occ = await loadOccurrence(ctx, occurrenceId);
  const facts = await accessFacts(ctx);
  if (!canViewMeeting(occ.meeting, facts)) throw new NotFoundError("Meeting not found.");
  return { occurrence: occ, canManage: canManageMeeting(occ.meeting, facts) };
}

export async function getOccurrenceForManage(ctx: OrgContext, occurrenceId: string) {
  const occ = await loadOccurrence(ctx, occurrenceId);
  if (!canManageMeeting(occ.meeting, await accessFacts(ctx))) throw new ForbiddenError("Only hosts can manage this meeting.");
  return occ;
}

export async function cancelOccurrence(ctx: OrgContext, occurrenceId: string, reason?: string) {
  requireActiveOrg(ctx);
  const occ = await getOccurrenceForManage(ctx, occurrenceId);
  if (occ.status !== "SCHEDULED") throw new ConflictError("Only scheduled sessions can be cancelled.");
  await db.meetingOccurrence.update({ where: { id: occ.id }, data: { status: "CANCELLED", cancelReason: reason?.slice(0, 500) ?? null } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "meeting.occurrence_cancelled", targetType: "MeetingOccurrence", targetId: occ.id });
  await notifyAudience(ctx, occ.meetingId, `Cancelled: ${occ.meeting.title}`, reason ? `Reason: ${reason}` : "This session has been cancelled.", occ.id);
}

const rescheduleSchema = z.object({ date: dateString, time: timeString, durationMinutes: z.coerce.number().int().min(10).max(720).optional() });

export async function rescheduleOccurrence(ctx: OrgContext, occurrenceId: string, input: unknown) {
  requireActiveOrg(ctx);
  const occ = await getOccurrenceForManage(ctx, occurrenceId);
  if (occ.status !== "SCHEDULED") throw new ConflictError("Only scheduled sessions can be rescheduled.");
  const data = parseInput(rescheduleSchema, input);
  const start = DateTime.fromISO(`${data.date}T${data.time}`, { zone: occ.meeting.timezone });
  if (!start.isValid) throw new ValidationError("Invalid date or time.");
  if (start.toMillis() < Date.now()) throw new ValidationError("Choose a time in the future.", { date: "Must be in the future." });
  const duration = data.durationMinutes ?? occ.meeting.durationMinutes;
  await db.meetingOccurrence.update({
    where: { id: occ.id },
    data: { startsAt: start.toUTC().toJSDate(), endsAt: start.plus({ minutes: duration }).toUTC().toJSDate(), rescheduled: true },
  });
  await db.meetingReminderLog.deleteMany({ where: { occurrenceId: occ.id } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "meeting.occurrence_rescheduled", targetType: "MeetingOccurrence", targetId: occ.id });
  await notifyAudience(
    ctx,
    occ.meetingId,
    `Rescheduled: ${occ.meeting.title}`,
    `New time: ${start.toFormat("cccc d LLLL yyyy, HH:mm")} (${occ.meeting.timezone}).`,
    occ.id,
  );
}

export async function setPostMeetingNote(ctx: OrgContext, occurrenceId: string, note: string) {
  const occ = await getOccurrenceForManage(ctx, occurrenceId);
  await db.meetingOccurrence.update({ where: { id: occ.id }, data: { postMeetingNote: note.trim().slice(0, 4000) || null } });
}

/** Builds the Prisma filter for occurrences visible to the actor. */
export function visibleOccurrenceWhere(ctx: OrgContext, facts: MeetingAccessFacts): Prisma.MeetingOccurrenceWhereInput {
  if (facts.canManageAll) return { organizationId: ctx.org.id };
  return {
    organizationId: ctx.org.id,
    meeting: {
      OR: [
        { visibility: { in: ["PUBLIC", "MEMBERS"] } },
        { visibility: "GROUP", groupId: { in: facts.groupIds } },
        { invitees: { some: { userId: facts.userId } } },
        { hosts: { some: { userId: facts.userId } } },
      ],
    },
  };
}

export async function listUpcomingOccurrences(ctx: OrgContext, opts: { days?: number; take?: number; includeCancelled?: boolean } = {}) {
  const facts = await accessFacts(ctx);
  const now = new Date();
  return db.meetingOccurrence.findMany({
    where: {
      AND: [
        visibleOccurrenceWhere(ctx, facts),
        {
          endsAt: { gte: now },
          startsAt: { lte: DateTime.fromJSDate(now).plus({ days: opts.days ?? 30 }).toJSDate() },
          meeting: { status: { not: "ARCHIVED" } },
          ...(opts.includeCancelled ? {} : { status: { not: "CANCELLED" } }),
        },
      ],
    },
    include: { meeting: { select: { id: true, title: true, mode: true, theme: true, timezone: true, visibility: true, groupId: true, externalUrl: true } } },
    orderBy: { startsAt: "asc" },
    take: opts.take ?? 50,
  });
}

export async function recordJoinIntent(ctx: OrgContext, occurrenceId: string) {
  const { occurrence } = await getOccurrenceForMember(ctx, occurrenceId);
  await db.meetingJoinIntent.create({ data: { organizationId: ctx.org.id, occurrenceId: occurrence.id, userId: ctx.actor.id } });
  return occurrence;
}

/** Host-recorded attendance — used for WhatsApp meetings, where the platform cannot observe participation. */
export async function markAttendance(ctx: OrgContext, occurrenceId: string, userIds: string[]) {
  const occ = await getOccurrenceForManage(ctx, occurrenceId);
  const valid = await db.membership.findMany({ where: { organizationId: ctx.org.id, status: "ACTIVE", userId: { in: userIds } }, select: { userId: true } });
  for (const { userId } of valid) {
    await db.meetingAttendance.upsert({
      where: { occurrenceId_userId: { occurrenceId: occ.id, userId } },
      create: { organizationId: ctx.org.id, occurrenceId: occ.id, userId, source: "HOST_MARKED", firstJoinedAt: occ.startsAt, markedById: ctx.actor.id },
      update: {},
    });
  }
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "meeting.attendance_marked", targetType: "MeetingOccurrence", targetId: occ.id, metadata: { count: valid.length } });
  return valid.length;
}

export function isOccurrenceJoinable(occ: Pick<MeetingOccurrence, "status" | "startsAt" | "endsAt">, now = new Date(), earlyMinutes = 15) {
  if (occ.status === "CANCELLED" || occ.status === "ENDED") return false;
  return now.getTime() >= occ.startsAt.getTime() - earlyMinutes * 60_000 && now.getTime() <= occ.endsAt.getTime() + 60 * 60_000;
}
