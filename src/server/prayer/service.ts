import "server-only";
import type { Prisma, PrayerRequest } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { parseInput } from "../validate";
import { audit } from "../audit";
import { rateLimit } from "../rate-limit";
import { notify } from "../notifications";
import { assertFeature } from "../billing/entitlements";
import type { OrgContext } from "../tenancy/context";
import { can, requireActiveOrg } from "../tenancy/context";
import { myGroupIds } from "../groups/service";
import { canModeratePrayerRequest, canViewPrayerRequest, type PrayerViewer } from "./access";
import { checkbox, optionalText } from "@/lib/validation";

export async function prayerViewer(ctx: OrgContext): Promise<PrayerViewer> {
  const [groupIds, assignments] = await Promise.all([
    myGroupIds(ctx.org.id, ctx.actor.id),
    db.prayerRequestAssignment.findMany({ where: { organizationId: ctx.org.id, userId: ctx.actor.id }, select: { requestId: true } }),
  ]);
  return {
    userId: ctx.actor.id,
    isCoordinator: can(ctx, "prayer.view_confidential"),
    isModerator: can(ctx, "prayer.moderate"),
    groupIds,
    assignedRequestIds: new Set(assignments.map((a) => a.requestId)),
  };
}

/** Prisma filter equivalent of canViewPrayerRequest (kept in lock-step; covered by tests). */
export function visiblePrayerWhere(ctx: OrgContext, v: PrayerViewer): Prisma.PrayerRequestWhereInput {
  const or: Prisma.PrayerRequestWhereInput[] = [{ authorId: v.userId }, { id: { in: [...v.assignedRequestIds] } }];
  if (v.isCoordinator) or.push({ visibility: "PRIVATE" });
  if (v.isCoordinator || v.isModerator) or.push({ visibility: { in: ["GROUP", "ORGANIZATION"] } });
  else {
    or.push({ visibility: "ORGANIZATION", moderationStatus: "APPROVED" });
    or.push({ visibility: "GROUP", moderationStatus: "APPROVED", groupId: { in: v.groupIds } });
  }
  return { organizationId: ctx.org.id, OR: or };
}

const createSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    body: z.string().trim().min(3).max(5000),
    visibility: z.enum(["PRIVATE", "GROUP", "ORGANIZATION"]),
    groupId: optionalText(40),
    anonymous: checkbox,
    acknowledgeVisibility: z.literal("on", { error: "Please confirm you understand who can see this request." }),
  })
  .refine((d) => d.visibility !== "GROUP" || !!d.groupId, { path: ["groupId"], error: "Choose a group." });

export async function createPrayerRequest(ctx: OrgContext, input: unknown) {
  requireActiveOrg(ctx);
  await assertFeature(ctx.org.id, "feature.prayer_requests");
  const data = parseInput(createSchema, input);
  await rateLimit(`prayer:create:${ctx.org.id}:${ctx.actor.id}`, 20, 3600);
  if (data.anonymous && !ctx.org.allowAnonymousPrayer) throw new ValidationError("This community does not allow anonymous requests.", { anonymous: "Not allowed here." });
  if (data.visibility === "GROUP") {
    const inGroup = await db.groupMembership.findFirst({ where: { groupId: data.groupId!, userId: ctx.actor.id, organizationId: ctx.org.id } });
    if (!inGroup) throw new ValidationError("You can only share with groups you belong to.", { groupId: "Not a member of this group." });
  }
  const needsModeration = data.visibility !== "PRIVATE" && ctx.org.moderateSharedPrayer;
  const req = await db.prayerRequest.create({
    data: {
      organizationId: ctx.org.id,
      authorId: ctx.actor.id,
      title: data.title,
      body: data.body,
      visibility: data.visibility,
      groupId: data.visibility === "GROUP" ? data.groupId! : null,
      anonymous: data.anonymous,
      moderationStatus: needsModeration ? "PENDING" : "APPROVED",
    },
  });
  // Coordinators are told a request arrived — without its content.
  const coordinators = await db.membership.findMany({
    where: { organizationId: ctx.org.id, status: "ACTIVE", roles: { has: "PRAYER_COORDINATOR" }, userId: { not: ctx.actor.id } },
    select: { userId: true },
  });
  await notify({
    userIds: coordinators.map((c) => c.userId),
    organizationId: ctx.org.id,
    category: "PRAYER",
    title: needsModeration ? "A prayer request is awaiting review" : "A new prayer request was submitted",
    link: `/o/${ctx.org.slug}/admin/prayer`,
  });
  return req;
}

async function loadVisible(ctx: OrgContext, requestId: string) {
  const req = await db.prayerRequest.findFirst({ where: { id: requestId, organizationId: ctx.org.id } });
  if (!req) throw new NotFoundError("Prayer request not found.");
  const viewer = await prayerViewer(ctx);
  if (!canViewPrayerRequest(req, viewer)) throw new NotFoundError("Prayer request not found.");
  return { req, viewer };
}

export async function getPrayerRequest(ctx: OrgContext, requestId: string) {
  const { req, viewer } = await loadVisible(ctx, requestId);
  const full = await db.prayerRequest.findUniqueOrThrow({
    where: { id: req.id },
    include: {
      author: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
      updates: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
      assignments: { include: { user: { select: { id: true, name: true } } } },
      _count: { select: { acknowledgements: true } },
      acknowledgements: { where: { userId: ctx.actor.id }, select: { id: true } },
    },
  });
  return {
    request: full,
    viewer,
    isAuthor: req.authorId === ctx.actor.id,
    canModerate: canModeratePrayerRequest(req, viewer),
    canAssign: can(ctx, "prayer.assign"),
  };
}

export async function listPrayerRequests(
  ctx: OrgContext,
  opts: { scope?: "mine" | "community" | "assigned" | "moderation"; status?: PrayerRequest["status"]; take?: number } = {},
) {
  const viewer = await prayerViewer(ctx);
  const base = visiblePrayerWhere(ctx, viewer);
  const scope: Prisma.PrayerRequestWhereInput =
    opts.scope === "mine"
      ? { authorId: ctx.actor.id }
      : opts.scope === "assigned"
        ? { id: { in: [...viewer.assignedRequestIds] } }
        : opts.scope === "moderation"
          ? { moderationStatus: "PENDING" }
          : opts.scope === "community"
            ? { visibility: { in: ["GROUP", "ORGANIZATION"] }, moderationStatus: "APPROVED" }
            : {};
  return db.prayerRequest.findMany({
    where: { AND: [base, scope, opts.status ? { status: opts.status } : {}] },
    include: { author: { select: { id: true, name: true } }, group: { select: { name: true } }, _count: { select: { acknowledgements: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 100,
  });
}

export async function acknowledgePrayer(ctx: OrgContext, requestId: string) {
  const { req } = await loadVisible(ctx, requestId);
  if (req.moderationStatus !== "APPROVED" && req.authorId !== ctx.actor.id) throw new ForbiddenError("This request is awaiting review.");
  await rateLimit(`prayer:ack:${ctx.actor.id}`, 200, 3600);
  const created = await db.prayerAcknowledgement.upsert({
    where: { requestId_userId: { requestId: req.id, userId: ctx.actor.id } },
    create: { requestId: req.id, userId: ctx.actor.id },
    update: {},
  });
  if (req.authorId !== ctx.actor.id) {
    await notify({ userIds: [req.authorId], organizationId: ctx.org.id, category: "PRAYER", title: "Someone prayed for your request", link: `/o/${ctx.org.slug}/prayer/${req.id}` });
  }
  return created;
}

const authorUpdateSchema = z.object({
  body: optionalText(3000),
  status: z.enum(["OPEN", "ANSWERED", "CLOSED"]).optional(),
});

/** Only the author may post updates or change the status of their request. */
export async function updateOwnPrayerRequest(ctx: OrgContext, requestId: string, input: unknown) {
  const data = parseInput(authorUpdateSchema, input);
  const req = await db.prayerRequest.findFirst({ where: { id: requestId, organizationId: ctx.org.id } });
  if (!req || req.authorId !== ctx.actor.id) throw new NotFoundError("Prayer request not found.");
  await db.$transaction(async (tx) => {
    if (data.body) await tx.prayerRequestUpdate.create({ data: { requestId: req.id, authorId: ctx.actor.id, body: data.body } });
    if (data.status && data.status !== req.status) {
      await tx.prayerRequest.update({ where: { id: req.id }, data: { status: data.status, answeredAt: data.status === "ANSWERED" ? new Date() : null } });
    }
  });
}

export async function deleteOwnPrayerRequest(ctx: OrgContext, requestId: string) {
  const res = await db.prayerRequest.deleteMany({ where: { id: requestId, organizationId: ctx.org.id, authorId: ctx.actor.id } });
  if (!res.count) throw new NotFoundError("Prayer request not found.");
}

export async function moderatePrayerRequest(ctx: OrgContext, requestId: string, decision: "APPROVED" | "REJECTED" | "HIDDEN") {
  requireActiveOrg(ctx);
  const req = await db.prayerRequest.findFirst({ where: { id: requestId, organizationId: ctx.org.id } });
  if (!req) throw new NotFoundError("Prayer request not found.");
  const viewer = await prayerViewer(ctx);
  if (!canModeratePrayerRequest(req, viewer)) throw new NotFoundError("Prayer request not found.");
  await db.prayerRequest.update({ where: { id: req.id }, data: { moderationStatus: decision, moderatedById: ctx.actor.id } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: `prayer.${decision.toLowerCase()}`, targetType: "PrayerRequest", targetId: req.id });
  if (decision !== "APPROVED") {
    await notify({
      userIds: [req.authorId],
      organizationId: ctx.org.id,
      category: "PRAYER",
      title: "Your prayer request was not shared",
      body: "A moderator decided not to share your request with the community. It remains visible to you and the prayer coordinators.",
      link: `/o/${ctx.org.slug}/prayer/${req.id}`,
    });
  }
}

const assignSchema = z.object({
  userId: z.string().min(1).max(40),
  followUpAt: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((d) => !d || !Number.isNaN(d.getTime()), { error: "Invalid date." }),
});

export async function assignPrayerRequest(ctx: OrgContext, requestId: string, input: unknown) {
  if (!can(ctx, "prayer.assign")) throw new ForbiddenError();
  requireActiveOrg(ctx);
  const data = parseInput(assignSchema, input);
  const req = await db.prayerRequest.findFirst({ where: { id: requestId, organizationId: ctx.org.id } });
  if (!req) throw new NotFoundError("Prayer request not found.");
  const member = await db.membership.findUnique({ where: { organizationId_userId: { organizationId: ctx.org.id, userId: data.userId } } });
  if (!member || member.status !== "ACTIVE") throw new ValidationError("Choose an active member of this community.");
  await db.prayerRequestAssignment.upsert({
    where: { requestId_userId: { requestId: req.id, userId: data.userId } },
    create: { organizationId: ctx.org.id, requestId: req.id, userId: data.userId, assignedById: ctx.actor.id, followUpAt: data.followUpAt },
    update: { followUpAt: data.followUpAt ?? null, followUpSentAt: null },
  });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "prayer.assigned", targetType: "PrayerRequest", targetId: req.id, metadata: { assigneeId: data.userId } });
  await notify({
    userIds: [data.userId],
    organizationId: ctx.org.id,
    category: "PRAYER",
    title: "A prayer request has been entrusted to you",
    link: `/o/${ctx.org.slug}/prayer/${req.id}`,
    email: true,
  });
}

export async function unassignPrayerRequest(ctx: OrgContext, requestId: string, userId: string) {
  if (!can(ctx, "prayer.assign")) throw new ForbiddenError();
  await db.prayerRequestAssignment.deleteMany({ where: { requestId, userId, organizationId: ctx.org.id } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "prayer.unassigned", targetType: "PrayerRequest", targetId: requestId, metadata: { assigneeId: userId } });
}

/** Scheduler: remind assignees whose follow-up date has arrived. */
export async function sendPrayerFollowUps(now = new Date()) {
  const due = await db.prayerRequestAssignment.findMany({
    where: { followUpAt: { lte: now }, followUpSentAt: null },
    include: { request: { select: { id: true, organization: { select: { slug: true } } } } },
    take: 200,
  });
  for (const a of due) {
    const claimed = await db.prayerRequestAssignment.updateMany({ where: { id: a.id, followUpSentAt: null }, data: { followUpSentAt: now } });
    if (!claimed.count) continue;
    await notify({
      userIds: [a.userId],
      organizationId: a.organizationId,
      category: "PRAYER",
      title: "Prayer follow-up reminder",
      body: "It's time to follow up on a prayer request entrusted to you.",
      link: `/o/${a.request.organization.slug}/prayer/${a.request.id}`,
      email: true,
    });
  }
  return due.length;
}
