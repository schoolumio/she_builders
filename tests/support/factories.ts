import type { OrgRole, Organization, User } from "@prisma/client";
import { db } from "@/server/db";
import { getOrgContext, type OrgContext } from "@/server/tenancy/context";
import { randomToken } from "@/server/crypto";

let n = 0;
const uniq = () => `${Date.now().toString(36)}${(n++).toString(36)}${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`;

export async function createUser(overrides: Partial<User> = {}) {
  const id = uniq();
  return db.user.create({
    data: { email: `user-${id}@example.test`, name: `User ${id}`, emailVerifiedAt: new Date(), passwordHash: null, ...overrides },
  });
}

export async function createOrg(owner: User, opts: { plan?: string; slug?: string; overrides?: Partial<Omit<Organization, "socialLinks">> } = {}) {
  const slug = opts.slug ?? `org-${uniq()}`;
  const plan = await db.plan.findUniqueOrThrow({ where: { code: opts.plan ?? "MINISTRY" } });
  const org = await db.organization.create({
    data: {
      slug,
      name: `Org ${slug}`,
      country: "NG",
      timezone: "Africa/Lagos",
      defaultCurrency: "NGN",
      termsAcceptedAt: new Date(),
      termsAcceptedById: owner.id,
      ...opts.overrides,
    },
  });
  await db.membership.create({ data: { organizationId: org.id, userId: owner.id, roles: ["OWNER", "MEMBER"], status: "ACTIVE", joinedAt: new Date() } });
  await db.subscription.create({ data: { organizationId: org.id, planId: plan.id, status: "ACTIVE", currentPeriodStart: new Date(), billingProvider: "manual" } });
  return org;
}

export async function addMember(org: Organization, roles: OrgRole[] = ["MEMBER"], user?: User) {
  const u = user ?? (await createUser());
  await db.membership.create({ data: { organizationId: org.id, userId: u.id, roles: [...new Set<OrgRole>([...roles, "MEMBER"])], status: "ACTIVE", joinedAt: new Date() } });
  return u;
}

export async function ctxFor(user: User, org: Organization): Promise<OrgContext> {
  return getOrgContext(user, { id: org.id });
}

export async function createGroup(org: Organization, members: User[] = []) {
  const g = await db.communityGroup.create({ data: { organizationId: org.id, name: `Group ${uniq()}` } });
  for (const m of members) await db.groupMembership.create({ data: { organizationId: org.id, groupId: g.id, userId: m.id } });
  return g;
}

export function formData(obj: Record<string, string | string[] | undefined>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}
