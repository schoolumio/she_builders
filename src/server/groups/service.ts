import "server-only";
import { z } from "zod";
import { db } from "../db";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { parseInput } from "../validate";
import { audit } from "../audit";
import { assertFeature, assertWithinLimit } from "../billing/entitlements";
import type { OrgContext } from "../tenancy/context";
import { requireActiveOrg, requirePermission } from "../tenancy/context";
import { optionalText } from "@/lib/validation";

const groupSchema = z.object({ name: z.string().trim().min(2).max(80), description: optionalText(1000) });

export async function createGroup(ctx: OrgContext, input: unknown) {
  requirePermission(ctx, "groups.manage");
  requireActiveOrg(ctx);
  const data = parseInput(groupSchema, input);
  await assertFeature(ctx.org.id, "feature.groups");
  await assertWithinLimit(ctx.org.id, "limit.groups", await db.communityGroup.count({ where: { organizationId: ctx.org.id, archivedAt: null } }));
  if (await db.communityGroup.findUnique({ where: { organizationId_name: { organizationId: ctx.org.id, name: data.name } } })) {
    throw new ConflictError("A group with that name already exists.");
  }
  const group = await db.communityGroup.create({ data: { ...data, organizationId: ctx.org.id } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "group.created", targetType: "CommunityGroup", targetId: group.id });
  return group;
}

export async function updateGroup(ctx: OrgContext, groupId: string, input: unknown) {
  requirePermission(ctx, "groups.manage");
  requireActiveOrg(ctx);
  const data = parseInput(groupSchema, input);
  const res = await db.communityGroup.updateMany({ where: { id: groupId, organizationId: ctx.org.id }, data });
  if (!res.count) throw new NotFoundError("Group not found.");
}

export async function archiveGroup(ctx: OrgContext, groupId: string) {
  requirePermission(ctx, "groups.manage");
  const res = await db.communityGroup.updateMany({ where: { id: groupId, organizationId: ctx.org.id }, data: { archivedAt: new Date() } });
  if (!res.count) throw new NotFoundError("Group not found.");
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "group.archived", targetType: "CommunityGroup", targetId: groupId });
}

async function loadGroup(ctx: OrgContext, groupId: string) {
  const g = await db.communityGroup.findFirst({ where: { id: groupId, organizationId: ctx.org.id, archivedAt: null } });
  if (!g) throw new NotFoundError("Group not found.");
  return g;
}

export async function addGroupMember(ctx: OrgContext, groupId: string, userId: string, role: "LEADER" | "MEMBER" = "MEMBER") {
  requirePermission(ctx, "groups.manage");
  requireActiveOrg(ctx);
  const group = await loadGroup(ctx, groupId);
  const m = await db.membership.findUnique({ where: { organizationId_userId: { organizationId: ctx.org.id, userId } } });
  if (!m || m.status !== "ACTIVE") throw new ValidationError("Only active members can be added to a group.");
  await db.groupMembership.upsert({
    where: { groupId_userId: { groupId: group.id, userId } },
    create: { organizationId: ctx.org.id, groupId: group.id, userId, role },
    update: { role },
  });
}

export async function removeGroupMember(ctx: OrgContext, groupId: string, userId: string) {
  requirePermission(ctx, "groups.manage");
  const group = await loadGroup(ctx, groupId);
  await db.groupMembership.deleteMany({ where: { groupId: group.id, userId } });
}

/** Members may join or leave groups themselves. */
export async function joinGroup(ctx: OrgContext, groupId: string) {
  requireActiveOrg(ctx);
  const group = await loadGroup(ctx, groupId);
  await db.groupMembership.upsert({
    where: { groupId_userId: { groupId: group.id, userId: ctx.actor.id } },
    create: { organizationId: ctx.org.id, groupId: group.id, userId: ctx.actor.id },
    update: {},
  });
}

export async function leaveGroup(ctx: OrgContext, groupId: string) {
  await db.groupMembership.deleteMany({ where: { groupId, userId: ctx.actor.id, organizationId: ctx.org.id } });
}

export async function listGroups(ctx: OrgContext) {
  return db.communityGroup.findMany({
    where: { organizationId: ctx.org.id, archivedAt: null },
    include: { _count: { select: { members: true } }, members: { where: { userId: ctx.actor.id }, select: { role: true } } },
    orderBy: { name: "asc" },
  });
}

export async function myGroupIds(organizationId: string, userId: string): Promise<string[]> {
  const rows = await db.groupMembership.findMany({ where: { organizationId, userId }, select: { groupId: true } });
  return rows.map((r) => r.groupId);
}
