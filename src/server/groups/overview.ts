import "server-only";
import { db } from "../db";
import { NotFoundError } from "../errors";
import type { OrgContext } from "../tenancy/context";
import { can } from "../tenancy/context";
import { prayerViewer, visiblePrayerWhere } from "../prayer/service";

/**
 * Everything shared with one group. Group members (and leaders/administrators) see the group's
 * meetings, announcements, prayer requests, programmes and members; other members see only the
 * description and an invitation to join.
 */
export async function getGroupOverview(ctx: OrgContext, groupId: string) {
  const group = await db.communityGroup.findFirst({
    where: { id: groupId, organizationId: ctx.org.id, archivedAt: null },
    include: { _count: { select: { members: true } }, members: { where: { userId: ctx.actor.id }, select: { role: true } } },
  });
  if (!group) throw new NotFoundError("Group not found.");
  const membership = group.members[0] ?? null;
  const canSeeInside = !!membership || can(ctx, "groups.manage") || can(ctx, "meetings.manage");
  if (!canSeeInside) return { group, membership, canSeeInside, meetings: [], announcements: [], prayers: [], programmes: [], members: [] };

  const viewer = await prayerViewer(ctx);
  const [meetings, announcements, prayers, programmes, members] = await Promise.all([
    db.meetingOccurrence.findMany({
      where: { organizationId: ctx.org.id, endsAt: { gte: new Date() }, status: { not: "CANCELLED" }, meeting: { groupId: group.id, visibility: "GROUP", status: "ACTIVE" } },
      include: { meeting: { select: { title: true, mode: true, theme: true } } },
      orderBy: { startsAt: "asc" },
      take: 6,
    }),
    db.announcement.findMany({ where: { organizationId: ctx.org.id, groupId: group.id, status: "PUBLISHED" }, orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }], take: 5 }),
    db.prayerRequest.findMany({
      where: { AND: [visiblePrayerWhere(ctx, viewer), { groupId: group.id, visibility: "GROUP", moderationStatus: "APPROVED" }] },
      include: { author: { select: { id: true, name: true } }, _count: { select: { acknowledgements: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.programme.findMany({ where: { organizationId: ctx.org.id, groupId: group.id, status: "PUBLISHED" }, orderBy: { startDate: "desc" }, take: 4 }),
    db.groupMembership.findMany({
      where: { groupId: group.id },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      take: 200,
    }),
  ]);
  return { group, membership, canSeeInside, meetings, announcements, prayers, programmes, members };
}
