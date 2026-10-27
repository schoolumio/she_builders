import "server-only";
import type { Membership, Organization, User } from "@prisma/client";
import { db } from "../db";
import { ForbiddenError, NotFoundError } from "../errors";
import { permissionsFor, type Permission } from "./permissions";

export type Actor = Pick<User, "id" | "name" | "email" | "platformRole">;

export type OrgContext = {
  actor: Actor;
  org: Organization;
  membership: Membership;
  permissions: Set<Permission>;
};

/**
 * Resolves the caller's ACTIVE membership in an organisation identified by slug or id.
 * Throws NotFoundError when the user is not an active member so that private organisations
 * do not reveal their existence. Suspended organisations are only reachable for owners
 * (so they can see why) — everything else is blocked.
 */
export async function getOrgContext(actor: Actor, slugOrId: { slug: string } | { id: string }): Promise<OrgContext> {
  const org = await db.organization.findUnique({ where: "slug" in slugOrId ? { slug: slugOrId.slug } : { id: slugOrId.id } });
  if (!org || org.status === "CLOSED") throw new NotFoundError("Community not found.");
  const membership = await db.membership.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: actor.id } },
  });
  if (!membership || membership.status !== "ACTIVE") throw new NotFoundError("Community not found.");
  if (org.status === "SUSPENDED" && !membership.roles.includes("OWNER")) {
    throw new ForbiddenError("This community is currently suspended.");
  }
  return { actor, org, membership, permissions: permissionsFor(membership.roles) };
}

export function can(ctx: OrgContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

export function requirePermission(ctx: OrgContext, permission: Permission): void {
  if (!ctx.permissions.has(permission)) throw new ForbiddenError();
}

export function requireAnyPermission(ctx: OrgContext, permissions: Permission[]): void {
  if (!permissions.some((p) => ctx.permissions.has(p))) throw new ForbiddenError();
}

/** Write operations are refused while an organisation is suspended. */
export function requireActiveOrg(ctx: OrgContext): void {
  if (ctx.org.status !== "ACTIVE") throw new ForbiddenError("This community is currently suspended.");
}
