import "server-only";
import { z } from "zod";
import { db } from "../db";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { parseInput } from "../validate";
import { audit } from "../audit";
import { rateLimit } from "../rate-limit";
import { notify } from "../notifications";
import type { OrgContext } from "../tenancy/context";
import { can, requireActiveOrg, requirePermission } from "../tenancy/context";
import { myGroupIds } from "../groups/service";
import { checkbox, dateString, optionalText, scriptureList } from "@/lib/validation";
import { todayInZone } from "@/lib/time";

// ---------------------------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------------------------

const announcementSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(10000),
  groupId: optionalText(40),
  pinned: checkbox,
  publish: checkbox,
});

async function audienceForGroup(organizationId: string, groupId: string | null) {
  if (groupId) return (await db.groupMembership.findMany({ where: { groupId }, select: { userId: true } })).map((r) => r.userId);
  return (await db.membership.findMany({ where: { organizationId, status: "ACTIVE" }, select: { userId: true } })).map((r) => r.userId);
}

export async function saveAnnouncement(ctx: OrgContext, input: unknown, id?: string) {
  requirePermission(ctx, "content.publish");
  requireActiveOrg(ctx);
  const data = parseInput(announcementSchema, input);
  if (data.groupId && !(await db.communityGroup.findFirst({ where: { id: data.groupId, organizationId: ctx.org.id } }))) {
    throw new ValidationError("Choose a valid group.");
  }
  const existing = id ? await db.announcement.findFirst({ where: { id, organizationId: ctx.org.id } }) : null;
  if (id && !existing) throw new NotFoundError("Announcement not found.");
  const publishingNow = data.publish && existing?.status !== "PUBLISHED";
  const fields = {
    title: data.title,
    body: data.body,
    groupId: data.groupId ?? null,
    pinned: data.pinned,
    status: data.publish ? ("PUBLISHED" as const) : existing?.status === "PUBLISHED" ? ("PUBLISHED" as const) : ("DRAFT" as const),
    publishedAt: publishingNow ? new Date() : existing?.publishedAt,
  };
  const ann = existing
    ? await db.announcement.update({ where: { id: existing.id }, data: fields })
    : await db.announcement.create({ data: { ...fields, organizationId: ctx.org.id, authorId: ctx.actor.id } });
  if (publishingNow) {
    await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "announcement.published", targetType: "Announcement", targetId: ann.id });
    await notify({
      userIds: await audienceForGroup(ctx.org.id, ann.groupId),
      organizationId: ctx.org.id,
      category: "ANNOUNCEMENTS",
      title: `${ctx.org.name}: ${ann.title}`,
      body: ann.body.slice(0, 280),
      link: `/o/${ctx.org.slug}/announcements`,
      email: true,
    });
  }
  return ann;
}

export async function archiveAnnouncement(ctx: OrgContext, id: string) {
  requirePermission(ctx, "content.publish");
  const res = await db.announcement.updateMany({ where: { id, organizationId: ctx.org.id }, data: { status: "ARCHIVED", pinned: false } });
  if (!res.count) throw new NotFoundError("Announcement not found.");
}

export async function listAnnouncementsForMember(ctx: OrgContext, take = 30) {
  const groups = await myGroupIds(ctx.org.id, ctx.actor.id);
  return db.announcement.findMany({
    where: { organizationId: ctx.org.id, status: "PUBLISHED", OR: [{ groupId: null }, { groupId: { in: groups } }] },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    include: { group: { select: { name: true } } },
    take,
  });
}

// ---------------------------------------------------------------------------------------------
// Prayer points
// ---------------------------------------------------------------------------------------------

const prayerPointSchema = z.object({
  forDate: dateString,
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(8000),
  scriptureRefs: scriptureList,
  publish: checkbox,
});

export async function savePrayerPoint(ctx: OrgContext, input: unknown, id?: string) {
  requirePermission(ctx, "content.publish");
  requireActiveOrg(ctx);
  const data = parseInput(prayerPointSchema, input);
  const existing = id ? await db.prayerPoint.findFirst({ where: { id, organizationId: ctx.org.id } }) : null;
  if (id && !existing) throw new NotFoundError("Prayer point not found.");
  const status = data.publish || existing?.status === "PUBLISHED" ? ("PUBLISHED" as const) : ("DRAFT" as const);
  const fields = {
    forDate: data.forDate,
    title: data.title,
    body: data.body,
    scriptureRefs: data.scriptureRefs,
    status,
    publishedAt: status === "PUBLISHED" ? (existing?.publishedAt ?? new Date()) : null,
  };
  const pp = existing
    ? await db.prayerPoint.update({ where: { id: existing.id }, data: fields })
    : await db.prayerPoint.create({ data: { ...fields, organizationId: ctx.org.id, authorId: ctx.actor.id } });
  if (status === "PUBLISHED" && existing?.status !== "PUBLISHED") {
    await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "prayer_point.published", targetType: "PrayerPoint", targetId: pp.id });
  }
  return pp;
}

export async function deletePrayerPoint(ctx: OrgContext, id: string) {
  requirePermission(ctx, "content.publish");
  const res = await db.prayerPoint.deleteMany({ where: { id, organizationId: ctx.org.id } });
  if (!res.count) throw new NotFoundError("Prayer point not found.");
}

export async function listPrayerPoints(ctx: OrgContext, opts: { includeDrafts?: boolean; take?: number } = {}) {
  if (opts.includeDrafts) requirePermission(ctx, "content.publish");
  return db.prayerPoint.findMany({
    where: { organizationId: ctx.org.id, ...(opts.includeDrafts ? {} : { status: "PUBLISHED", forDate: { lte: todayInZone(ctx.org.timezone) } }) },
    orderBy: [{ forDate: "desc" }, { createdAt: "desc" }],
    take: opts.take ?? 30,
  });
}

// ---------------------------------------------------------------------------------------------
// Testimonies (consent-based, moderated)
// ---------------------------------------------------------------------------------------------

const testimonySchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    body: z.string().trim().min(10).max(8000),
    audience: z.enum(["MEMBERS", "PUBLIC"]),
    showName: checkbox,
    prayerRequestId: optionalText(40),
    consent: z.literal("on", { error: "Please confirm you consent to sharing this testimony." }),
    publicConsent: checkbox,
  })
  .refine((d) => d.audience !== "PUBLIC" || d.publicConsent, {
    path: ["publicConsent"],
    error: "Public testimonies need your explicit consent to be shown to anyone on the internet.",
  });

export async function submitTestimony(ctx: OrgContext, input: unknown) {
  requireActiveOrg(ctx);
  const data = parseInput(testimonySchema, input);
  await rateLimit(`testimony:${ctx.actor.id}`, 10, 86400);
  if (data.prayerRequestId) {
    const own = await db.prayerRequest.findFirst({ where: { id: data.prayerRequestId, organizationId: ctx.org.id, authorId: ctx.actor.id } });
    if (!own) throw new ValidationError("You can only link your own prayer requests.");
  }
  const moderated = ctx.org.moderateTestimonies || data.audience === "PUBLIC";
  const t = await db.testimony.create({
    data: {
      organizationId: ctx.org.id,
      authorId: ctx.actor.id,
      prayerRequestId: data.prayerRequestId ?? null,
      title: data.title,
      body: data.body,
      audience: data.audience,
      showName: data.showName,
      consentGivenAt: new Date(),
      moderationStatus: moderated ? "PENDING" : "APPROVED",
      publishedAt: moderated ? null : new Date(),
    },
  });
  return t;
}

export async function moderateTestimony(ctx: OrgContext, id: string, decision: "APPROVED" | "REJECTED" | "HIDDEN") {
  requirePermission(ctx, "content.moderate");
  const t = await db.testimony.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!t) throw new NotFoundError("Testimony not found.");
  await db.testimony.update({
    where: { id: t.id },
    data: { moderationStatus: decision, moderatedById: ctx.actor.id, publishedAt: decision === "APPROVED" ? (t.publishedAt ?? new Date()) : null },
  });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: `testimony.${decision.toLowerCase()}`, targetType: "Testimony", targetId: t.id });
}

export async function withdrawTestimony(ctx: OrgContext, id: string) {
  const res = await db.testimony.deleteMany({ where: { id, organizationId: ctx.org.id, authorId: ctx.actor.id } });
  if (!res.count) throw new NotFoundError("Testimony not found.");
}

export async function listTestimonies(ctx: OrgContext, opts: { moderation?: boolean } = {}) {
  if (opts.moderation) requirePermission(ctx, "content.moderate");
  return db.testimony.findMany({
    where: {
      organizationId: ctx.org.id,
      ...(opts.moderation ? { moderationStatus: "PENDING" } : { OR: [{ moderationStatus: "APPROVED" }, { authorId: ctx.actor.id }] }),
    },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function listPublicTestimonies(organizationId: string, take = 6) {
  return db.testimony.findMany({
    where: { organizationId, audience: "PUBLIC", moderationStatus: "APPROVED" },
    include: { author: { select: { name: true } } },
    orderBy: { publishedAt: "desc" },
    take,
  });
}

// ---------------------------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------------------------

const reportSchema = z.object({
  targetType: z.enum(["PRAYER_REQUEST", "TESTIMONY", "ANNOUNCEMENT", "MEMBER", "MEETING"]),
  targetId: z.string().min(1).max(40),
  reason: z.string().trim().min(5).max(1000),
});

export async function reportContent(ctx: OrgContext, input: unknown) {
  const data = parseInput(reportSchema, input);
  await rateLimit(`report:${ctx.actor.id}`, 20, 86400);
  const report = await db.contentReport.create({ data: { ...data, organizationId: ctx.org.id, reporterId: ctx.actor.id } });
  const mods = await db.membership.findMany({
    where: { organizationId: ctx.org.id, status: "ACTIVE", roles: { hasSome: ["MODERATOR", "ADMIN", "OWNER"] } },
    select: { userId: true },
  });
  await notify({ userIds: mods.map((m) => m.userId), organizationId: ctx.org.id, category: "ACCOUNT", title: "New content report", link: `/o/${ctx.org.slug}/admin/reports` });
  return report;
}

export async function resolveReport(ctx: OrgContext, id: string, status: "RESOLVED" | "DISMISSED", resolution?: string) {
  if (!can(ctx, "content.moderate")) throw new ForbiddenError();
  const res = await db.contentReport.updateMany({
    where: { id, organizationId: ctx.org.id },
    data: { status, resolution: resolution?.slice(0, 1000) ?? null, resolvedById: ctx.actor.id },
  });
  if (!res.count) throw new NotFoundError("Report not found.");
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: `report.${status.toLowerCase()}`, targetType: "ContentReport", targetId: id });
}

export async function listReports(ctx: OrgContext) {
  requirePermission(ctx, "content.moderate");
  return db.contentReport.findMany({
    where: { organizationId: ctx.org.id },
    include: { reporter: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
}
