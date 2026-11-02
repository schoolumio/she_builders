import "server-only";
import { db } from "@/server/db";
import { getEntitlements } from "@/server/billing/entitlements";
import { commonTimezones } from "@/lib/time";
import type { OrgContext } from "@/server/tenancy/context";

export async function meetingFormData(ctx: OrgContext) {
  const [members, groups, ent] = await Promise.all([
    db.membership.findMany({ where: { organizationId: ctx.org.id, status: "ACTIVE" }, include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" }, take: 1000 }),
    db.communityGroup.findMany({ where: { organizationId: ctx.org.id, archivedAt: null }, orderBy: { name: "asc" } }),
    getEntitlements(ctx.org.id),
  ]);
  return {
    members: members.map((m) => ({ id: m.user.id, name: m.user.name })),
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    timezones: commonTimezones(),
    features: { audio: ent.features.has("feature.in_app_audio"), video: ent.features.has("feature.in_app_video"), recurring: ent.features.has("feature.recurring_meetings") },
  };
}
