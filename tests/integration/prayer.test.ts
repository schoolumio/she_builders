import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../support/db";
import { addMember, createGroup, createOrg, createUser, ctxFor } from "../support/factories";
import {
  acknowledgePrayer,
  assignPrayerRequest,
  createPrayerRequest,
  deleteOwnPrayerRequest,
  getPrayerRequest,
  listPrayerRequests,
  moderatePrayerRequest,
  prayerViewer,
  updateOwnPrayerRequest,
  visiblePrayerWhere,
} from "@/server/prayer/service";
import { canViewPrayerRequest } from "@/server/prayer/access";
import { submitTestimony, moderateTestimony, listTestimonies, listPublicTestimonies } from "@/server/content/service";
import { EntitlementError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

beforeEach(resetDb);

async function setup() {
  const owner = await createUser();
  const org = await createOrg(owner, { overrides: { moderateSharedPrayer: false } });
  const admin = await addMember(org, ["ADMIN"]);
  const coordinator = await addMember(org, ["PRAYER_COORDINATOR"]);
  const moderator = await addMember(org, ["MODERATOR"]);
  const finance = await addMember(org, ["FINANCE_ADMIN"]);
  const author = await addMember(org);
  const groupMate = await addMember(org);
  const other = await addMember(org);
  const group = await createGroup(org, [author, groupMate]);
  return { owner, org, admin, coordinator, moderator, finance, author, groupMate, other, group };
}

const req = (o: Record<string, unknown> = {}) => ({ title: "Please pray", body: "For my mother's surgery", visibility: "PRIVATE", acknowledgeVisibility: "on", ...o });

describe("prayer request visibility", () => {
  it("private requests are visible only to the author and prayer coordinators", async () => {
    const s = await setup();
    const pr = await createPrayerRequest(await ctxFor(s.author, s.org), req());
    await expect(getPrayerRequest(await ctxFor(s.author, s.org), pr.id)).resolves.toBeTruthy();
    await expect(getPrayerRequest(await ctxFor(s.coordinator, s.org), pr.id)).resolves.toBeTruthy();
    for (const u of [s.owner, s.admin, s.moderator, s.finance, s.groupMate, s.other]) {
      await expect(getPrayerRequest(await ctxFor(u, s.org), pr.id)).rejects.toBeInstanceOf(NotFoundError);
    }
    expect(await listPrayerRequests(await ctxFor(s.owner, s.org))).toHaveLength(0);
  });

  it("assignment by a coordinator grants a prayer-team member access", async () => {
    const s = await setup();
    const pr = await createPrayerRequest(await ctxFor(s.author, s.org), req());
    await expect(assignPrayerRequest(await ctxFor(s.admin, s.org), pr.id, { userId: s.other.id })).rejects.toBeInstanceOf(ForbiddenError);
    await assignPrayerRequest(await ctxFor(s.coordinator, s.org), pr.id, { userId: s.other.id });
    await expect(getPrayerRequest(await ctxFor(s.other, s.org), pr.id)).resolves.toBeTruthy();
  });

  it("group requests are visible to group members only", async () => {
    const s = await setup();
    const pr = await createPrayerRequest(await ctxFor(s.author, s.org), req({ visibility: "GROUP", groupId: s.group.id }));
    await expect(getPrayerRequest(await ctxFor(s.groupMate, s.org), pr.id)).resolves.toBeTruthy();
    await expect(getPrayerRequest(await ctxFor(s.other, s.org), pr.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createPrayerRequest(await ctxFor(s.other, s.org), req({ visibility: "GROUP", groupId: s.group.id }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("moderation hides shared requests until approved", async () => {
    const s = await setup();
    await db.organization.update({ where: { id: s.org.id }, data: { moderateSharedPrayer: true } });
    const ctx = await ctxFor(s.author, s.org);
    const pr = await createPrayerRequest(ctx, req({ visibility: "ORGANIZATION" }));
    expect(pr.moderationStatus).toBe("PENDING");
    await expect(getPrayerRequest(await ctxFor(s.other, s.org), pr.id)).rejects.toBeInstanceOf(NotFoundError);
    await moderatePrayerRequest(await ctxFor(s.moderator, s.org), pr.id, "APPROVED");
    await expect(getPrayerRequest(await ctxFor(s.other, s.org), pr.id)).resolves.toBeTruthy();
    await expect(moderatePrayerRequest(await ctxFor(s.finance, s.org), pr.id, "HIDDEN")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("moderators cannot moderate (or see) private requests", async () => {
    const s = await setup();
    const pr = await createPrayerRequest(await ctxFor(s.author, s.org), req());
    await expect(moderatePrayerRequest(await ctxFor(s.moderator, s.org), pr.id, "HIDDEN")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("only the author can update or delete a request", async () => {
    const s = await setup();
    const pr = await createPrayerRequest(await ctxFor(s.author, s.org), req({ visibility: "ORGANIZATION" }));
    await expect(updateOwnPrayerRequest(await ctxFor(s.coordinator, s.org), pr.id, { status: "ANSWERED" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteOwnPrayerRequest(await ctxFor(s.owner, s.org), pr.id)).rejects.toBeInstanceOf(NotFoundError);
    await updateOwnPrayerRequest(await ctxFor(s.author, s.org), pr.id, { status: "ANSWERED", body: "Surgery went well" });
    expect((await db.prayerRequest.findUniqueOrThrow({ where: { id: pr.id } })).status).toBe("ANSWERED");
    await deleteOwnPrayerRequest(await ctxFor(s.author, s.org), pr.id);
    expect(await db.prayerRequest.count()).toBe(0);
  });

  it("anonymous requests respect the organisation setting", async () => {
    const s = await setup();
    await db.organization.update({ where: { id: s.org.id }, data: { allowAnonymousPrayer: false } });
    await expect(createPrayerRequest(await ctxFor(s.author, s.org), req({ anonymous: "on", visibility: "ORGANIZATION" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires the member to acknowledge who can see the request", async () => {
    const s = await setup();
    await expect(createPrayerRequest(await ctxFor(s.author, s.org), { title: "x", body: "yyyy", visibility: "PRIVATE" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("acknowledgements are idempotent and notify the author", async () => {
    const s = await setup();
    const pr = await createPrayerRequest(await ctxFor(s.author, s.org), req({ visibility: "ORGANIZATION" }));
    await acknowledgePrayer(await ctxFor(s.other, s.org), pr.id);
    await acknowledgePrayer(await ctxFor(s.other, s.org), pr.id);
    expect(await db.prayerAcknowledgement.count({ where: { requestId: pr.id } })).toBe(1);
    expect(await db.notification.count({ where: { userId: s.author.id, category: "PRAYER" } })).toBeGreaterThan(0);
  });

  it("the database filter matches the access function for every role and visibility", async () => {
    const s = await setup();
    await db.organization.update({ where: { id: s.org.id }, data: { moderateSharedPrayer: true } });
    const ids: string[] = [];
    for (const visibility of ["PRIVATE", "GROUP", "ORGANIZATION"] as const) {
      for (const status of ["PENDING", "APPROVED", "HIDDEN"] as const) {
        const r = await db.prayerRequest.create({
          data: { organizationId: s.org.id, authorId: s.author.id, title: "t", body: "b", visibility, groupId: visibility === "GROUP" ? s.group.id : null, moderationStatus: status },
        });
        ids.push(r.id);
      }
    }
    for (const u of [s.owner, s.admin, s.coordinator, s.moderator, s.finance, s.author, s.groupMate, s.other]) {
      const ctx = await ctxFor(u, s.org);
      const viewer = await prayerViewer(ctx);
      const viaDb = new Set((await db.prayerRequest.findMany({ where: visiblePrayerWhere(ctx, viewer), select: { id: true } })).map((r) => r.id));
      const all = await db.prayerRequest.findMany({ where: { id: { in: ids } } });
      const viaFn = new Set(all.filter((r) => canViewPrayerRequest(r, viewer)).map((r) => r.id));
      expect([...viaDb].sort()).toEqual([...viaFn].sort());
    }
  });

  it("is gated by plan entitlement", async () => {
    const owner = await createUser();
    const org = await createOrg(owner, { plan: "FREE" });
    await expect(createPrayerRequest(await ctxFor(owner, org), req())).rejects.toBeInstanceOf(EntitlementError);
  });
});

describe("testimonies", () => {
  it("require consent, are moderated, and public ones need explicit public consent", async () => {
    const s = await setup();
    const ctx = await ctxFor(s.author, s.org);
    await expect(submitTestimony(ctx, { title: "Answered", body: "God answered my prayer", audience: "MEMBERS" })).rejects.toBeInstanceOf(ValidationError);
    await expect(submitTestimony(ctx, { title: "Answered", body: "God answered my prayer", audience: "PUBLIC", consent: "on" })).rejects.toBeInstanceOf(ValidationError);
    const t = await submitTestimony(ctx, { title: "Answered", body: "God answered my prayer", audience: "PUBLIC", consent: "on", publicConsent: "on", showName: "on" });
    expect(t.moderationStatus).toBe("PENDING");
    expect(await listPublicTestimonies(s.org.id)).toHaveLength(0);
    expect((await listTestimonies(await ctxFor(s.other, s.org))).map((x) => x.id)).not.toContain(t.id);
    await expect(moderateTestimony(await ctxFor(s.finance, s.org), t.id, "APPROVED")).rejects.toBeInstanceOf(ForbiddenError);
    await moderateTestimony(await ctxFor(s.moderator, s.org), t.id, "APPROVED");
    expect(await listPublicTestimonies(s.org.id)).toHaveLength(1);
  });

  it("can only link the author's own prayer requests", async () => {
    const s = await setup();
    const pr = await createPrayerRequest(await ctxFor(s.author, s.org), req());
    await expect(
      submitTestimony(await ctxFor(s.other, s.org), { title: "Mine", body: "Not really mine at all", audience: "MEMBERS", consent: "on", prayerRequestId: pr.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
