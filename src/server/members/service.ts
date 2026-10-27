import "server-only";
import type { Membership, OrgRole } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { parseInput } from "../validate";
import { audit } from "../audit";
import { rateLimit } from "../rate-limit";
import { randomToken, sha256 } from "../crypto";
import { env } from "../env";
import { renderEmail, sendEmail } from "../email";
import { notify } from "../notifications";
import { assertWithinLimit } from "../billing/entitlements";
import type { Actor, OrgContext } from "../tenancy/context";
import { can, requireActiveOrg, requirePermission } from "../tenancy/context";
import { LIMITED_ASSIGNABLE_ROLES, ROLE_LABELS } from "../tenancy/permissions";
import { emailSchema, optionalText } from "@/lib/validation";

const ELEVATED: OrgRole[] = ["OWNER", "ADMIN", "FINANCE_ADMIN", "PRAYER_COORDINATOR"];
const ALL_ROLES: OrgRole[] = ["OWNER", "ADMIN", "MODERATOR", "PRAYER_COORDINATOR", "HOST", "FINANCE_ADMIN", "MEMBER"];
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function isElevated(roles: OrgRole[]) {
  return roles.some((r) => ELEVATED.includes(r));
}

async function activeMemberCount(organizationId: string) {
  return db.membership.count({ where: { organizationId, status: "ACTIVE" } });
}

async function elevatedCount(organizationId: string) {
  return db.membership.count({ where: { organizationId, status: "ACTIVE", roles: { hasSome: ELEVATED } } });
}

/** Ensures the actor may grant every role in `roles`. */
function assertCanGrant(ctx: OrgContext, roles: OrgRole[]) {
  for (const role of roles) {
    if (role === "MEMBER") continue;
    if (role === "OWNER") throw new ForbiddenError("Ownership can only be transferred, not granted.");
    if (can(ctx, "roles.assign")) continue;
    if (can(ctx, "roles.assign_limited") && LIMITED_ASSIGNABLE_ROLES.includes(role)) continue;
    throw new ForbiddenError(`You cannot assign the ${ROLE_LABELS[role]} role.`);
  }
}

/** Members with elevated roles can only be managed by owners; owners are never managed this way. */
function assertCanManageMember(ctx: OrgContext, target: Membership) {
  requirePermission(ctx, "members.manage");
  if (target.userId === ctx.actor.id) throw new ForbiddenError("You cannot do that to your own membership.");
  if (target.roles.includes("OWNER")) throw new ForbiddenError("Owners cannot be changed. Transfer ownership first.");
  if (isElevated(target.roles) && !ctx.membership.roles.includes("OWNER")) {
    throw new ForbiddenError("Only an owner can manage administrators.");
  }
}

async function loadMembership(ctx: OrgContext, membershipId: string) {
  const m = await db.membership.findFirst({ where: { id: membershipId, organizationId: ctx.org.id } });
  if (!m) throw new NotFoundError("Member not found.");
  return m;
}

// ---------------------------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------------------------

const inviteSchema = z.object({
  emails: z
    .string()
    .transform((v) => [...new Set(v.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))])
    .pipe(z.array(emailSchema).min(1, { error: "Enter at least one email address." }).max(50, { error: "Invite up to 50 people at a time." })),
  roles: z
    .union([z.array(z.enum(ALL_ROLES as [OrgRole, ...OrgRole[]])), z.enum(ALL_ROLES as [OrgRole, ...OrgRole[]])])
    .optional()
    .transform((v) => [...new Set<OrgRole>(["MEMBER", ...(v ? (Array.isArray(v) ? v : [v]) : [])])]),
  groupIds: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((v) => (v ? (Array.isArray(v) ? v : [v]) : [])),
  message: optionalText(500),
});

export async function createInvitations(ctx: OrgContext, input: unknown) {
  requirePermission(ctx, "members.manage");
  requireActiveOrg(ctx);
  const data = parseInput(inviteSchema, input);
  assertCanGrant(ctx, data.roles);
  await rateLimit(`invite:${ctx.org.id}`, 300, 86400);
  if (data.groupIds.length) {
    const count = await db.communityGroup.count({ where: { id: { in: data.groupIds }, organizationId: ctx.org.id } });
    if (count !== data.groupIds.length) throw new ValidationError("One of the selected groups does not exist.");
  }
  await assertWithinLimit(ctx.org.id, "limit.members", await activeMemberCount(ctx.org.id), data.emails.length);

  const results: { email: string; status: "invited" | "already_member" }[] = [];
  for (const email of data.emails) {
    const existingUser = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) {
      const m = await db.membership.findUnique({ where: { organizationId_userId: { organizationId: ctx.org.id, userId: existingUser.id } } });
      if (m?.status === "ACTIVE") {
        results.push({ email, status: "already_member" });
        continue;
      }
    }
    // Revoke earlier pending invitations to the same address.
    await db.invitation.updateMany({
      where: { organizationId: ctx.org.id, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const token = randomToken(32);
    const inv = await db.invitation.create({
      data: {
        organizationId: ctx.org.id,
        email,
        roles: data.roles,
        groupIds: data.groupIds,
        tokenHash: sha256(token),
        invitedById: ctx.actor.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    const { text, html } = renderEmail({
      heading: `You're invited to join ${ctx.org.name}`,
      paragraphs: [
        `${ctx.actor.name} has invited you to join ${ctx.org.name}.`,
        ...(data.message ? [`Message: “${data.message}”`] : []),
        "This invitation expires in 14 days. If you weren't expecting it, you can ignore this email.",
      ],
      action: { label: "Accept invitation", url: `${env.appUrl}/invite/${token}` },
    });
    await sendEmail({ to: email, subject: `Invitation to join ${ctx.org.name}`, text, html, category: "ACCOUNT" });
    await audit({
      organizationId: ctx.org.id,
      actorId: ctx.actor.id,
      action: "invitation.created",
      targetType: "Invitation",
      targetId: inv.id,
      metadata: { roles: data.roles },
    });
    results.push({ email, status: "invited" });
  }
  return results;
}

export async function revokeInvitation(ctx: OrgContext, invitationId: string) {
  requirePermission(ctx, "members.manage");
  const res = await db.invitation.updateMany({
    where: { id: invitationId, organizationId: ctx.org.id, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (res.count === 0) throw new NotFoundError("Invitation not found.");
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "invitation.revoked", targetType: "Invitation", targetId: invitationId });
}

export async function findInvitationByToken(token: string) {
  if (!token || token.length > 200) return null;
  const inv = await db.invitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { organization: { select: { id: true, name: true, slug: true, logoUrl: true, status: true } }, invitedBy: { select: { name: true } } },
  });
  if (!inv) return null;
  const usable = !inv.acceptedAt && !inv.revokedAt && inv.expiresAt > new Date() && inv.organization.status === "ACTIVE";
  return { invitation: inv, usable };
}

export async function acceptInvitation(actor: Actor & { email: string }, token: string) {
  const found = await findInvitationByToken(token);
  if (!found || !found.usable) throw new ValidationError("This invitation is invalid, expired or has already been used.");
  const inv = found.invitation;
  if (inv.email.toLowerCase() !== actor.email.toLowerCase()) {
    throw new ForbiddenError(`This invitation was sent to a different email address. Sign in with that address to accept it.`);
  }
  await assertWithinLimit(inv.organizationId, "limit.members", await activeMemberCount(inv.organizationId));
  const willBeElevated = isElevated(inv.roles);
  if (willBeElevated) await assertWithinLimit(inv.organizationId, "limit.admins", await elevatedCount(inv.organizationId));

  return db.$transaction(async (tx) => {
    // Conditional update makes the token strictly single-use under concurrency.
    const claimed = await tx.invitation.updateMany({
      where: { id: inv.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: new Date(), acceptedById: actor.id },
    });
    if (claimed.count !== 1) throw new ConflictError("This invitation has already been used.");
    const existing = await tx.membership.findUnique({ where: { organizationId_userId: { organizationId: inv.organizationId, userId: actor.id } } });
    const roles = [...new Set<OrgRole>([...(existing?.status === "ACTIVE" ? existing.roles : []), ...inv.roles, "MEMBER"])];
    const membership = existing
      ? await tx.membership.update({ where: { id: existing.id }, data: { status: "ACTIVE", roles, joinedAt: existing.joinedAt ?? new Date() } })
      : await tx.membership.create({ data: { organizationId: inv.organizationId, userId: actor.id, roles, status: "ACTIVE", joinedAt: new Date() } });
    if (inv.groupIds.length) {
      const groups = await tx.communityGroup.findMany({ where: { id: { in: inv.groupIds }, organizationId: inv.organizationId }, select: { id: true } });
      for (const g of groups) {
        await tx.groupMembership.upsert({
          where: { groupId_userId: { groupId: g.id, userId: actor.id } },
          create: { organizationId: inv.organizationId, groupId: g.id, userId: actor.id },
          update: {},
        });
      }
    }
    // Following a link sent to this address proves control of it.
    await tx.user.update({ where: { id: actor.id }, data: { emailVerifiedAt: new Date() } });
    await audit(
      { organizationId: inv.organizationId, actorId: actor.id, action: "invitation.accepted", targetType: "Invitation", targetId: inv.id, metadata: { roles } },
      tx,
    );
    return { membership, organization: found.invitation.organization };
  });
}

// ---------------------------------------------------------------------------------------------
// Join requests
// ---------------------------------------------------------------------------------------------

export async function requestToJoin(actor: Actor, organizationId: string, input: unknown) {
  const { message } = parseInput(z.object({ message: optionalText(500) }), input);
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org || org.status !== "ACTIVE" || org.visibility === "PRIVATE") throw new NotFoundError("Community not found.");
  if (org.joinPolicy === "INVITE_ONLY") throw new ForbiddenError("This community is invitation only.");
  await rateLimit(`join:${actor.id}`, 20, 3600);
  const existing = await db.membership.findUnique({ where: { organizationId_userId: { organizationId, userId: actor.id } } });
  if (existing?.status === "ACTIVE") return existing;
  if (existing?.status === "PENDING") return existing;
  if (existing?.status === "SUSPENDED" || existing?.status === "REMOVED") {
    throw new ForbiddenError("You cannot rejoin this community. Please contact its administrators.");
  }
  const status = org.joinPolicy === "OPEN" ? "ACTIVE" : "PENDING";
  if (status === "ACTIVE") await assertWithinLimit(organizationId, "limit.members", await activeMemberCount(organizationId));
  const membership = existing
    ? await db.membership.update({ where: { id: existing.id }, data: { status, roles: ["MEMBER"], joinMessage: message, joinedAt: status === "ACTIVE" ? new Date() : null } })
    : await db.membership.create({ data: { organizationId, userId: actor.id, status, roles: ["MEMBER"], joinMessage: message, joinedAt: status === "ACTIVE" ? new Date() : null } });
  await audit({ organizationId, actorId: actor.id, action: status === "ACTIVE" ? "member.joined" : "member.join_requested", targetType: "Membership", targetId: membership.id });
  if (status === "PENDING") {
    const admins = await db.membership.findMany({ where: { organizationId, status: "ACTIVE", roles: { hasSome: ["OWNER", "ADMIN"] } }, select: { userId: true } });
    await notify({
      userIds: admins.map((a) => a.userId),
      organizationId,
      category: "ACCOUNT",
      title: `${actor.name} asked to join ${org.name}`,
      link: `/o/${org.slug}/admin/members?status=PENDING`,
    });
  }
  return membership;
}

export async function decideJoinRequest(ctx: OrgContext, membershipId: string, approve: boolean) {
  requirePermission(ctx, "members.manage");
  requireActiveOrg(ctx);
  const m = await loadMembership(ctx, membershipId);
  if (m.status !== "PENDING") throw new ConflictError("This request has already been handled.");
  if (approve) await assertWithinLimit(ctx.org.id, "limit.members", await activeMemberCount(ctx.org.id));
  await db.membership.update({
    where: { id: m.id },
    data: approve ? { status: "ACTIVE", joinedAt: new Date() } : { status: "REJECTED" },
  });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: approve ? "member.approved" : "member.rejected", targetType: "Membership", targetId: m.id });
  await notify({
    userIds: [m.userId],
    organizationId: ctx.org.id,
    category: "ACCOUNT",
    title: approve ? `Welcome to ${ctx.org.name}!` : `Your request to join ${ctx.org.name} was not approved`,
    link: approve ? `/o/${ctx.org.slug}` : undefined,
    email: true,
  });
}

// ---------------------------------------------------------------------------------------------
// Member management
// ---------------------------------------------------------------------------------------------

export async function setMemberRoles(ctx: OrgContext, membershipId: string, input: unknown) {
  const { roles: requested } = parseInput(
    z.object({
      roles: z
        .union([z.array(z.enum(ALL_ROLES as [OrgRole, ...OrgRole[]])), z.enum(ALL_ROLES as [OrgRole, ...OrgRole[]])])
        .optional()
        .transform((v) => (v ? (Array.isArray(v) ? v : [v]) : [])),
    }),
    input,
  );
  requireActiveOrg(ctx);
  if (!can(ctx, "roles.assign") && !can(ctx, "roles.assign_limited")) throw new ForbiddenError();
  const target = await loadMembership(ctx, membershipId);
  if (target.status !== "ACTIVE") throw new ConflictError("Only active members can be given roles.");
  if (target.roles.includes("OWNER")) throw new ForbiddenError("Owner roles change only through ownership transfer.");
  if (target.userId === ctx.actor.id && !can(ctx, "roles.assign")) throw new ForbiddenError("You cannot change your own roles.");

  const next = new Set<OrgRole>([...requested.filter((r) => r !== "OWNER"), "MEMBER"]);
  const added = [...next].filter((r) => !target.roles.includes(r));
  const removed = target.roles.filter((r) => !next.has(r));
  assertCanGrant(ctx, [...added, ...removed]);
  if (!isElevated(target.roles) && isElevated([...next])) {
    await assertWithinLimit(ctx.org.id, "limit.admins", await elevatedCount(ctx.org.id));
  }
  const updated = await db.membership.update({ where: { id: target.id }, data: { roles: [...next] } });
  await audit({
    organizationId: ctx.org.id,
    actorId: ctx.actor.id,
    action: "member.roles_changed",
    targetType: "Membership",
    targetId: target.id,
    metadata: { added, removed },
  });
  return updated;
}

export async function transferOwnership(ctx: OrgContext, membershipId: string) {
  if (!ctx.membership.roles.includes("OWNER")) throw new ForbiddenError("Only an owner can transfer ownership.");
  const target = await loadMembership(ctx, membershipId);
  if (target.status !== "ACTIVE") throw new ConflictError("Ownership can only be transferred to an active member.");
  if (target.userId === ctx.actor.id) throw new ValidationError("You already own this community.");
  await db.$transaction([
    db.membership.update({ where: { id: target.id }, data: { roles: [...new Set<OrgRole>([...target.roles, "OWNER"])] } }),
    db.membership.update({
      where: { id: ctx.membership.id },
      data: { roles: [...new Set<OrgRole>([...ctx.membership.roles.filter((r) => r !== "OWNER"), "ADMIN", "MEMBER"])] },
    }),
  ]);
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "org.ownership_transferred", targetType: "Membership", targetId: target.id });
}

export async function setMemberStatus(ctx: OrgContext, membershipId: string, status: "SUSPENDED" | "ACTIVE" | "REMOVED") {
  requireActiveOrg(ctx);
  const target = await loadMembership(ctx, membershipId);
  assertCanManageMember(ctx, target);
  if (status === "ACTIVE" && target.status !== "SUSPENDED") throw new ConflictError("Only suspended members can be reinstated.");
  if (status === "ACTIVE") await assertWithinLimit(ctx.org.id, "limit.members", await activeMemberCount(ctx.org.id));
  await db.$transaction(async (tx) => {
    await tx.membership.update({
      where: { id: target.id },
      // Removing or suspending strips elevated roles so access cannot linger if reinstated.
      data: { status, roles: status === "ACTIVE" ? target.roles : ["MEMBER"] },
    });
    if (status === "REMOVED") await tx.groupMembership.deleteMany({ where: { organizationId: ctx.org.id, userId: target.userId } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: `member.${status.toLowerCase()}`, targetType: "Membership", targetId: target.id }, tx);
  });
}

export async function leaveOrganization(ctx: OrgContext) {
  if (ctx.membership.roles.includes("OWNER")) {
    const owners = await db.membership.count({ where: { organizationId: ctx.org.id, status: "ACTIVE", roles: { has: "OWNER" } } });
    if (owners <= 1) throw new ConflictError("Transfer ownership to another member before leaving.");
  }
  await db.$transaction(async (tx) => {
    await tx.membership.update({ where: { id: ctx.membership.id }, data: { status: "LEFT", roles: ["MEMBER"] } });
    await tx.groupMembership.deleteMany({ where: { organizationId: ctx.org.id, userId: ctx.actor.id } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "member.left", targetType: "Membership", targetId: ctx.membership.id }, tx);
  });
}

export async function listMembers(ctx: OrgContext, opts: { status?: Membership["status"]; q?: string } = {}) {
  requirePermission(ctx, "members.view");
  return db.membership.findMany({
    where: {
      organizationId: ctx.org.id,
      status: opts.status ?? "ACTIVE",
      ...(opts.q ? { user: { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { email: { contains: opts.q, mode: "insensitive" } }] } } : {}),
    },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
}
