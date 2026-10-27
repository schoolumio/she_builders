import "server-only";
import { DateTime } from "luxon";
import { z } from "zod";
import { db } from "../db";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { parseInput } from "../validate";
import { audit } from "../audit";
import { notify } from "../notifications";
import { assertFeature } from "../billing/entitlements";
import type { OrgContext } from "../tenancy/context";
import { can, requireActiveOrg, requirePermission } from "../tenancy/context";
import { myGroupIds } from "../groups/service";
import { checkbox, dateString, optionalText } from "@/lib/validation";

const programmeSchema = z.object({
  type: z.enum(["BIBLE_STUDY", "PRAYER_CHALLENGE", "DEVOTIONAL", "FASTING", "READING_PLAN", "REFLECTION", "MENTORSHIP"]),
  title: z.string().trim().min(3).max(140),
  description: optionalText(4000),
  startDate: dateString,
  durationDays: z.coerce.number().int().min(1).max(366),
  groupId: optionalText(40),
  trackCompletion: checkbox,
});

export const PROGRAMME_TYPE_LABELS = {
  BIBLE_STUDY: "Bible study",
  PRAYER_CHALLENGE: "Prayer challenge",
  DEVOTIONAL: "Devotional series",
  FASTING: "Prayer & fasting",
  READING_PLAN: "Reading plan",
  REFLECTION: "Reflection series",
  MENTORSHIP: "Mentorship",
} as const;

export async function saveProgramme(ctx: OrgContext, input: unknown, id?: string) {
  requirePermission(ctx, "programmes.manage");
  requireActiveOrg(ctx);
  await assertFeature(ctx.org.id, "feature.programmes");
  const d = parseInput(programmeSchema, input);
  if (d.groupId && !(await db.communityGroup.findFirst({ where: { id: d.groupId, organizationId: ctx.org.id } }))) throw new ValidationError("Choose a valid group.");
  const data = { ...d, groupId: d.groupId ?? null, description: d.description ?? null };
  if (id) {
    const res = await db.programme.updateMany({ where: { id, organizationId: ctx.org.id }, data });
    if (!res.count) throw new NotFoundError("Programme not found.");
    return db.programme.findUniqueOrThrow({ where: { id } });
  }
  const p = await db.programme.create({ data: { ...data, organizationId: ctx.org.id, createdById: ctx.actor.id } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "programme.created", targetType: "Programme", targetId: p.id });
  return p;
}

const activitySchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(366),
  title: z.string().trim().min(2).max(160),
  body: optionalText(10000),
  scriptureRefs: z
    .string()
    .optional()
    .transform((v) => (v ?? "").split(/[\n;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 20)),
  resourceUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => !v || /^https:\/\//.test(v), { error: "Use a secure https:// link." }),
  reflectionQuestions: z
    .string()
    .optional()
    .transform((v) => (v ?? "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 10)),
});

async function loadManaged(ctx: OrgContext, programmeId: string) {
  requirePermission(ctx, "programmes.manage");
  const p = await db.programme.findFirst({ where: { id: programmeId, organizationId: ctx.org.id } });
  if (!p) throw new NotFoundError("Programme not found.");
  return p;
}

export async function saveActivity(ctx: OrgContext, programmeId: string, input: unknown) {
  const p = await loadManaged(ctx, programmeId);
  const d = parseInput(activitySchema, input);
  if (d.dayNumber > p.durationDays) throw new ValidationError(`Day must be between 1 and ${p.durationDays}.`, { dayNumber: "Out of range." });
  await db.programmeActivity.upsert({
    where: { programmeId_dayNumber: { programmeId: p.id, dayNumber: d.dayNumber } },
    create: { ...d, resourceUrl: d.resourceUrl ?? null, body: d.body ?? null, programmeId: p.id },
    update: { ...d, resourceUrl: d.resourceUrl ?? null, body: d.body ?? null },
  });
}

export async function deleteActivity(ctx: OrgContext, programmeId: string, activityId: string) {
  const p = await loadManaged(ctx, programmeId);
  await db.programmeActivity.deleteMany({ where: { id: activityId, programmeId: p.id } });
}

export async function setProgrammeStatus(ctx: OrgContext, programmeId: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
  const p = await loadManaged(ctx, programmeId);
  if (status === "PUBLISHED" && (await db.programmeActivity.count({ where: { programmeId: p.id } })) === 0) {
    throw new ConflictError("Add at least one activity before publishing.");
  }
  await db.programme.update({ where: { id: p.id }, data: { status } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: `programme.${status.toLowerCase()}`, targetType: "Programme", targetId: p.id });
  if (status === "PUBLISHED" && p.status !== "PUBLISHED") {
    const audience = p.groupId
      ? (await db.groupMembership.findMany({ where: { groupId: p.groupId }, select: { userId: true } })).map((r) => r.userId)
      : (await db.membership.findMany({ where: { organizationId: ctx.org.id, status: "ACTIVE" }, select: { userId: true } })).map((r) => r.userId);
    await notify({ userIds: audience, organizationId: ctx.org.id, category: "PROGRAMMES", title: `New programme: ${p.title}`, link: `/o/${ctx.org.slug}/programmes/${p.id}` });
  }
}

async function loadVisible(ctx: OrgContext, programmeId: string) {
  const p = await db.programme.findFirst({
    where: { id: programmeId, organizationId: ctx.org.id },
    include: { activities: { orderBy: { dayNumber: "asc" } }, group: { select: { name: true } } },
  });
  if (!p) throw new NotFoundError("Programme not found.");
  if (!can(ctx, "programmes.manage")) {
    if (p.status !== "PUBLISHED") throw new NotFoundError("Programme not found.");
    if (p.groupId && !(await myGroupIds(ctx.org.id, ctx.actor.id)).includes(p.groupId)) throw new NotFoundError("Programme not found.");
  }
  return p;
}

export async function getProgramme(ctx: OrgContext, programmeId: string) {
  const p = await loadVisible(ctx, programmeId);
  const enrollment = await db.programmeEnrollment.findUnique({
    where: { programmeId_userId: { programmeId: p.id, userId: ctx.actor.id } },
    include: { completions: { select: { activityId: true } } },
  });
  const today = DateTime.now().setZone(ctx.org.timezone).startOf("day");
  const start = DateTime.fromISO(p.startDate, { zone: ctx.org.timezone });
  const currentDay = Math.floor(today.diff(start, "days").days) + 1;
  return { programme: p, enrollment, completed: new Set(enrollment?.completions.map((c) => c.activityId) ?? []), currentDay };
}

export async function listProgrammes(ctx: OrgContext, opts: { manage?: boolean } = {}) {
  if (opts.manage) requirePermission(ctx, "programmes.manage");
  const groups = await myGroupIds(ctx.org.id, ctx.actor.id);
  return db.programme.findMany({
    where: {
      organizationId: ctx.org.id,
      ...(opts.manage ? {} : { status: "PUBLISHED", OR: [{ groupId: null }, { groupId: { in: groups } }] }),
    },
    include: { _count: { select: { activities: true, enrollments: true } }, enrollments: { where: { userId: ctx.actor.id }, select: { id: true } } },
    orderBy: { startDate: "desc" },
  });
}

export async function enroll(ctx: OrgContext, programmeId: string) {
  requireActiveOrg(ctx);
  const p = await loadVisible(ctx, programmeId);
  if (p.status !== "PUBLISHED") throw new ConflictError("This programme is not open for enrolment.");
  await db.programmeEnrollment.upsert({
    where: { programmeId_userId: { programmeId: p.id, userId: ctx.actor.id } },
    create: { programmeId: p.id, userId: ctx.actor.id },
    update: {},
  });
}

export async function unenroll(ctx: OrgContext, programmeId: string) {
  await db.programmeEnrollment.deleteMany({ where: { programmeId, userId: ctx.actor.id, programme: { organizationId: ctx.org.id } } });
}

export async function setActivityComplete(ctx: OrgContext, programmeId: string, activityId: string, complete: boolean) {
  const p = await loadVisible(ctx, programmeId);
  if (!p.trackCompletion) throw new ConflictError("Completion is not tracked for this programme.");
  const enrollment = await db.programmeEnrollment.findUnique({ where: { programmeId_userId: { programmeId: p.id, userId: ctx.actor.id } } });
  if (!enrollment) throw new ConflictError("Join the programme first.");
  if (!p.activities.some((a) => a.id === activityId)) throw new NotFoundError("Activity not found.");
  if (complete) {
    await db.activityCompletion.upsert({
      where: { enrollmentId_activityId: { enrollmentId: enrollment.id, activityId } },
      create: { enrollmentId: enrollment.id, activityId },
      update: {},
    });
  } else {
    await db.activityCompletion.deleteMany({ where: { enrollmentId: enrollment.id, activityId } });
  }
}

export async function programmeProgress(ctx: OrgContext, programmeId: string) {
  await loadManaged(ctx, programmeId);
  return db.programmeEnrollment.findMany({
    where: { programmeId },
    include: { user: { select: { name: true } }, _count: { select: { completions: true } } },
    orderBy: { createdAt: "asc" },
  });
}
