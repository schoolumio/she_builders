import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../support/db";
import { addMember, createOrg, createUser, ctxFor } from "../support/factories";
import { assertFeature, getEntitlements } from "@/server/billing/entitlements";
import { assignPlanManually, expireSubscriptions, setCancelAtPeriodEnd, startSubscriptionCheckout } from "@/server/billing/service";
import { createGroup } from "@/server/groups/service";
import { exportUserData, deleteAccount } from "@/server/privacy/service";
import { ConfigurationError, ConflictError, EntitlementError, ForbiddenError } from "@/server/errors";
import { runScheduledTick, sendMeetingReminders } from "@/server/jobs/tick";
import { createMeeting } from "@/server/meetings/service";
import { notify, updatePreference } from "@/server/notifications";
import { createPrayerRequest } from "@/server/prayer/service";

beforeEach(resetDb);

describe("entitlements", () => {
  it("are enforced on the server from the database plan, not from any client value", async () => {
    const owner = await createUser();
    const org = await createOrg(owner, { plan: "FREE" });
    const ctx = await ctxFor(owner, org);
    await createGroup(ctx, { name: "First group" });
    await expect(createGroup(ctx, { name: "Second group", plan: "ENTERPRISE" })).rejects.toBeInstanceOf(EntitlementError);
    await expect(assertFeature(org.id, "feature.fundraising")).rejects.toBeInstanceOf(EntitlementError);
  });

  it("expired or cancelled subscriptions fall back to FREE after grace", async () => {
    const owner = await createUser();
    const org = await createOrg(owner, { plan: "GROWTH" });
    expect((await getEntitlements(org.id)).plan.code).toBe("GROWTH");
    await db.subscription.update({ where: { organizationId: org.id }, data: { currentPeriodEnd: new Date(Date.now() - 86400_000) } });
    await expireSubscriptions();
    const sub = await db.subscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(sub.status).toBe("PAST_DUE");
    expect((await getEntitlements(org.id)).plan.code).toBe("GROWTH"); // within grace
    await db.subscription.update({ where: { organizationId: org.id }, data: { graceEndsAt: new Date(Date.now() - 1000) } });
    await expireSubscriptions();
    const ent = await getEntitlements(org.id);
    expect(ent.plan.code).toBe("FREE");
    expect(ent.degraded).toBe(true);
  });

  it("only platform super admins assign plans manually; owners schedule cancellation", async () => {
    const owner = await createUser();
    const org = await createOrg(owner, { plan: "FREE" });
    await expect(assignPlanManually(owner, org.id, { planCode: "MINISTRY", status: "ACTIVE" })).rejects.toBeInstanceOf(ForbiddenError);
    const admin = await createUser({ platformRole: "SUPER_ADMIN" });
    await assignPlanManually(admin, org.id, { planCode: "MINISTRY", status: "ACTIVE" });
    expect((await getEntitlements(org.id)).plan.code).toBe("MINISTRY");
    const finance = await addMember(org, ["FINANCE_ADMIN"]);
    await expect(setCancelAtPeriodEnd(await ctxFor(finance, org), true)).rejects.toBeInstanceOf(ForbiddenError);
    await setCancelAtPeriodEnd(await ctxFor(owner, org), true);
    expect((await db.subscription.findUniqueOrThrow({ where: { organizationId: org.id } })).cancelAtPeriodEnd).toBe(true);
  });

  it("reports honestly when online billing is not configured", async () => {
    const owner = await createUser();
    const org = await createOrg(owner, { plan: "FREE" });
    await expect(startSubscriptionCheckout(await ctxFor(owner, org), "GROWTH", "MONTHLY")).rejects.toBeInstanceOf(ConfigurationError);
  });
});

describe("privacy", () => {
  it("exports only the user's own data and deletes accounts while retaining anonymised financial records", async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    const member = await addMember(org);
    await createPrayerRequest(await ctxFor(member, org), { title: "Mine", body: "Private request", visibility: "PRIVATE", acknowledgeVisibility: "on" });
    await createPrayerRequest(await ctxFor(owner, org), { title: "Owner's", body: "Owner request", visibility: "PRIVATE", acknowledgeVisibility: "on" });
    const conn = await db.paymentProviderConnection.create({ data: { organizationId: org.id, provider: "SIMULATOR", status: "VERIFIED", createdById: owner.id } });
    await db.donation.create({ data: { organizationId: org.id, connectionId: conn.id, provider: "SIMULATOR", reference: "don_privacy_test_ref", currency: "NGN", amount: 1000, status: "SUCCEEDED", donorUserId: member.id, donorEmail: member.email, donorName: member.name } });

    const exported = await exportUserData(member.id);
    expect(exported.prayerRequests.map((p) => p.title)).toEqual(["Mine"]);
    expect(exported.donations).toHaveLength(1);

    await deleteAccount(member.id);
    const u = await db.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(u.status).toBe("DELETED");
    expect(u.email).not.toBe(member.email);
    expect(await db.prayerRequest.count({ where: { authorId: member.id } })).toBe(0);
    const d = await db.donation.findUniqueOrThrow({ where: { reference: "don_privacy_test_ref" } });
    expect(d.donorUserId).toBeNull();
    expect(d.donorEmail).toBeNull();
    expect(d.amount).toBe(1000);
    await expect(deleteAccount(owner.id)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("notifications and scheduler", () => {
  it("honours category preferences", async () => {
    const owner = await createUser();
    await updatePreference(owner.id, "ANNOUNCEMENTS", { inApp: false, email: false });
    await notify({ userIds: [owner.id], category: "ANNOUNCEMENTS", title: "Hello", email: true });
    await notify({ userIds: [owner.id], category: "ACCOUNT", title: "Security", email: true });
    expect(await db.notification.count({ where: { userId: owner.id } })).toBe(1);
    expect(await db.emailOutbox.count({ where: { to: owner.email } })).toBe(1);
  });

  it("sends each meeting reminder once per member", async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    const member = await addMember(org);
    const start = new Date(Date.now() + 15 * 60_000);
    await createMeeting(await ctxFor(owner, org), {
      title: "Prayer",
      mode: "WHATSAPP",
      externalUrl: "https://chat.whatsapp.com/x",
      visibility: "MEMBERS",
      timezone: "UTC",
      startDate: start.toISOString().slice(0, 10),
      startTime: start.toISOString().slice(11, 16),
      durationMinutes: "30",
      frequency: "NONE",
    });
    const first = await sendMeetingReminders();
    expect(first).toBe(2);
    expect(await sendMeetingReminders()).toBe(0);
    expect(await db.notification.count({ where: { userId: member.id, category: "MEETINGS" } })).toBe(1);
    const res = await runScheduledTick();
    expect(Object.values(res)).not.toContain("error");
  });
});
