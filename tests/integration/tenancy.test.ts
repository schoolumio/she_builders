import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../support/db";
import { addMember, createGroup, createOrg, createUser, ctxFor } from "../support/factories";
import { getOrgContext } from "@/server/tenancy/context";
import { ForbiddenError, NotFoundError, ValidationError, ConflictError, EntitlementError } from "@/server/errors";
import { acceptInvitation, createInvitations, leaveOrganization, requestToJoin, setMemberRoles, setMemberStatus, transferOwnership } from "@/server/members/service";
import { createMeeting, getOccurrenceForMember } from "@/server/meetings/service";
import { getPrayerRequest, createPrayerRequest } from "@/server/prayer/service";
import { listDonations } from "@/server/payments/donations";
import { updateOrganizationProfile, createOrganization } from "@/server/orgs/service";
import { sha256 } from "@/server/crypto";

beforeEach(resetDb);

const meetingInput = (o: Record<string, unknown> = {}) => ({
  title: "Night prayer",
  mode: "WHATSAPP",
  visibility: "MEMBERS",
  externalUrl: "https://chat.whatsapp.com/abc",
  timezone: "Africa/Lagos",
  startDate: "2030-01-07",
  startTime: "21:00",
  durationMinutes: "60",
  frequency: "NONE",
  ...o,
});

describe("tenant isolation", () => {
  it("refuses organisation context to non-members (as not found)", async () => {
    const a = await createUser();
    const b = await createUser();
    const orgA = await createOrg(a);
    await createOrg(b);
    await expect(getOrgContext(b, { id: orgA.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getOrgContext(b, { slug: orgA.slug })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cannot read another organisation's meetings, prayer requests or donations by id", async () => {
    const a = await createUser();
    const b = await createUser();
    const orgA = await createOrg(a);
    const orgB = await createOrg(b);
    const ctxA = await ctxFor(a, orgA);
    const ctxB = await ctxFor(b, orgB);
    await createMeeting(ctxA, meetingInput());
    const occ = await db.meetingOccurrence.findFirstOrThrow({ where: { organizationId: orgA.id } });
    const pr = await createPrayerRequest(ctxA, { title: "Healing", body: "Please pray", visibility: "ORGANIZATION", acknowledgeVisibility: "on" });
    // IDOR attempts with valid ids from org A, using org B's context.
    await expect(getOccurrenceForMember(ctxB, occ.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPrayerRequest(ctxB, pr.id)).rejects.toBeInstanceOf(NotFoundError);
    const donations = await listDonations(ctxB);
    expect(donations).toEqual([]);
  });

  it("an admin of one organisation is not an admin of another", async () => {
    const owner = await createUser();
    const orgA = await createOrg(owner);
    const otherOwner = await createUser();
    const orgB = await createOrg(otherOwner);
    await addMember(orgB, ["MEMBER"], owner);
    const ctx = await ctxFor(owner, orgB);
    expect(ctx.permissions.has("org.settings")).toBe(false);
    await expect(updateOrganizationProfile(ctx, { name: "Hijack" })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await ctxFor(owner, orgA)).permissions.has("org.settings")).toBe(true);
  });

  it("members cannot use administrator functions", async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    const member = await addMember(org);
    const ctx = await ctxFor(member, org);
    await expect(createMeeting(ctx, meetingInput())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listDonations(ctx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createInvitations(ctx, { emails: "x@example.test" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("revoked administrators lose access immediately", async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    const admin = await addMember(org, ["ADMIN"]);
    const ownerCtx = await ctxFor(owner, org);
    const membership = await db.membership.findFirstOrThrow({ where: { userId: admin.id, organizationId: org.id } });
    expect((await ctxFor(admin, org)).permissions.has("members.manage")).toBe(true);
    await setMemberRoles(ownerCtx, membership.id, { roles: [] });
    expect((await ctxFor(admin, org)).permissions.has("members.manage")).toBe(false);
    await setMemberStatus(ownerCtx, membership.id, "REMOVED");
    await expect(ctxFor(admin, org)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("suspended organisations block non-owners", async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    const member = await addMember(org);
    await db.organization.update({ where: { id: org.id }, data: { status: "SUSPENDED" } });
    await expect(ctxFor(member, org)).rejects.toBeInstanceOf(ForbiddenError);
    const ownerCtx = await ctxFor(owner, org);
    await expect(updateOrganizationProfile(ownerCtx, {})).rejects.toBeTruthy();
  });
});

describe("roles", () => {
  it("only owners assign sensitive roles; admins assign limited roles", async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    const admin = await addMember(org, ["ADMIN"]);
    const member = await addMember(org);
    const m = await db.membership.findFirstOrThrow({ where: { userId: member.id, organizationId: org.id } });
    const adminCtx = await ctxFor(admin, org);
    await expect(setMemberRoles(adminCtx, m.id, { roles: ["FINANCE_ADMIN"] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setMemberRoles(adminCtx, m.id, { roles: ["PRAYER_COORDINATOR"] })).rejects.toBeInstanceOf(ForbiddenError);
    await setMemberRoles(adminCtx, m.id, { roles: ["HOST", "MODERATOR"] });
    expect((await db.membership.findUniqueOrThrow({ where: { id: m.id } })).roles.sort()).toEqual(["HOST", "MEMBER", "MODERATOR"]);
    const ownerCtx = await ctxFor(owner, org);
    await setMemberRoles(ownerCtx, m.id, { roles: ["FINANCE_ADMIN"] });
    expect((await db.membership.findUniqueOrThrow({ where: { id: m.id } })).roles).toContain("FINANCE_ADMIN");
  });

  it("nobody can grant OWNER through role assignment, and admins cannot manage other admins", async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    const admin = await addMember(org, ["ADMIN"]);
    const admin2 = await addMember(org, ["ADMIN"]);
    const m2 = await db.membership.findFirstOrThrow({ where: { userId: admin2.id, organizationId: org.id } });
    const ownerCtx = await ctxFor(owner, org);
    await setMemberRoles(ownerCtx, m2.id, { roles: ["OWNER", "ADMIN"] });
    expect((await db.membership.findUniqueOrThrow({ where: { id: m2.id } })).roles).not.toContain("OWNER");
    await expect(setMemberStatus(await ctxFor(admin, org), m2.id, "SUSPENDED")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("ownership transfer keeps exactly the intended owner set", async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    const next = await addMember(org);
    const nm = await db.membership.findFirstOrThrow({ where: { userId: next.id, organizationId: org.id } });
    await transferOwnership(await ctxFor(owner, org), nm.id);
    const roles = await db.membership.findMany({ where: { organizationId: org.id }, select: { userId: true, roles: true } });
    expect(roles.find((r) => r.userId === next.id)?.roles).toContain("OWNER");
    expect(roles.find((r) => r.userId === owner.id)?.roles).not.toContain("OWNER");
    expect(roles.find((r) => r.userId === owner.id)?.roles).toContain("ADMIN");
  });

  it("the last owner cannot leave", async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    await expect(leaveOrganization(await ctxFor(owner, org))).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("invitations", () => {
  it("are single use, bound to the invited email, and grant the invited roles", async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    const group = await createGroup(org);
    const invitee = await createUser({ email: "invitee@example.test", emailVerifiedAt: null });
    const stranger = await createUser();
    await createInvitations(await ctxFor(owner, org), { emails: "invitee@example.test", roles: ["HOST"], groupIds: [group.id] });
    const inv = await db.invitation.findFirstOrThrow({ where: { email: "invitee@example.test" } });
    // We only know the hash; issue a fresh known token for the test.
    const token = "known-test-token-1234567890";
    await db.invitation.update({ where: { id: inv.id }, data: { tokenHash: sha256(token) } });

    await expect(acceptInvitation(stranger, token)).rejects.toBeInstanceOf(ForbiddenError);
    const res = await acceptInvitation(invitee, token);
    expect(res.membership.roles).toContain("HOST");
    expect(await db.groupMembership.count({ where: { groupId: group.id, userId: invitee.id } })).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: invitee.id } })).emailVerifiedAt).not.toBeNull();
    await expect(acceptInvitation(invitee, token)).rejects.toBeInstanceOf(ValidationError);
  });

  it("expired and revoked invitations are rejected", async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    const invitee = await createUser({ email: "late@example.test" });
    await db.invitation.create({ data: { organizationId: org.id, email: "late@example.test", tokenHash: sha256("expired-token-123456"), invitedById: owner.id, expiresAt: new Date(Date.now() - 1000) } });
    await db.invitation.create({ data: { organizationId: org.id, email: "late@example.test", tokenHash: sha256("revoked-token-123456"), invitedById: owner.id, expiresAt: new Date(Date.now() + 1e6), revokedAt: new Date() } });
    await expect(acceptInvitation(invitee, "expired-token-123456")).rejects.toBeInstanceOf(ValidationError);
    await expect(acceptInvitation(invitee, "revoked-token-123456")).rejects.toBeInstanceOf(ValidationError);
  });

  it("admins cannot invite people into roles they cannot grant", async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    const admin = await addMember(org, ["ADMIN"]);
    await expect(createInvitations(await ctxFor(admin, org), { emails: "a@example.test", roles: ["FINANCE_ADMIN"] })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("joining", () => {
  it("respects join policy and plan member limits", async () => {
    const owner = await createUser();
    const org = await createOrg(owner, { plan: "FREE", overrides: { joinPolicy: "OPEN" } });
    const free = await db.plan.findUniqueOrThrow({ where: { code: "FREE" } });
    await db.planEntitlement.update({ where: { planId_key: { planId: free.id, key: "limit.members" } }, data: { limit: 2 } });
    const u1 = await createUser();
    const u2 = await createUser();
    expect((await requestToJoin(u1, org.id, {})).status).toBe("ACTIVE");
    await expect(requestToJoin(u2, org.id, {})).rejects.toBeInstanceOf(EntitlementError);
  });

  it("invite-only organisations refuse join requests; approval organisations queue them", async () => {
    const owner = await createUser();
    const inviteOnly = await createOrg(owner, { overrides: { joinPolicy: "INVITE_ONLY" } });
    const approval = await createOrg(owner, { overrides: { joinPolicy: "APPROVAL" } });
    const u = await createUser();
    await expect(requestToJoin(u, inviteOnly.id, {})).rejects.toBeInstanceOf(ForbiddenError);
    expect((await requestToJoin(u, approval.id, {})).status).toBe("PENDING");
    await expect(ctxFor(u, approval)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("organisation registration", () => {
  it("creates owner membership, FREE subscription and default gifts; rejects reserved slugs", async () => {
    const u = await createUser();
    const input = { name: "Grace Circle", slug: "grace-circle", country: "NG", timezone: "Africa/Lagos", defaultCurrency: "NGN", visibility: "PUBLIC", joinPolicy: "APPROVAL", acceptTerms: "on" };
    const org = await createOrganization(u, input);
    const ctx = await ctxFor(u, org);
    expect(ctx.membership.roles).toContain("OWNER");
    expect((await db.subscription.findUniqueOrThrow({ where: { organizationId: org.id }, include: { plan: true } })).plan.code).toBe("FREE");
    expect(await db.virtualGift.count({ where: { organizationId: org.id } })).toBeGreaterThan(0);
    await expect(createOrganization(u, { ...input, slug: "admin" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createOrganization(u, input)).rejects.toBeInstanceOf(ConflictError);
  });
});
