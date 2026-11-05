import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../support/db";
import { addMember, createGroup, createOrg, createUser, ctxFor } from "../support/factories";
import { createPrayerRequest, acknowledgePrayer } from "@/server/prayer/service";
import { submitTestimony } from "@/server/content/service";
import { addComment, deleteComment, getFeed, listComments, toggleAmen } from "@/server/social/service";
import { NotFoundError } from "@/server/errors";

beforeEach(resetDb);

async function setup() {
  const owner = await createUser();
  const org = await createOrg(owner, { overrides: { moderateSharedPrayer: false, moderateTestimonies: false } });
  const coordinator = await addMember(org, ["PRAYER_COORDINATOR"]);
  const moderator = await addMember(org, ["MODERATOR"]);
  const author = await addMember(org);
  const groupMate = await addMember(org);
  const other = await addMember(org);
  const group = await createGroup(org, [author, groupMate]);
  return { owner, org, coordinator, moderator, author, groupMate, other, group };
}

const req = (o: Record<string, unknown> = {}) => ({ title: "Please pray", body: "For my exams", visibility: "ORGANIZATION", acknowledgeVisibility: "on", ...o });

describe("community feed", () => {
  it("never shows private requests, even to coordinators who can open them", async () => {
    const s = await setup();
    await createPrayerRequest(await ctxFor(s.author, s.org), req({ visibility: "PRIVATE", title: "Private one" }));
    await createPrayerRequest(await ctxFor(s.author, s.org), req({ title: "Shared one" }));
    const feed = await getFeed(await ctxFor(s.coordinator, s.org));
    expect(feed.items.map((i) => i.title)).toEqual(["Shared one"]);
  });

  it("shows group requests only to the group", async () => {
    const s = await setup();
    await createPrayerRequest(await ctxFor(s.author, s.org), req({ visibility: "GROUP", groupId: s.group.id, title: "Group one" }));
    expect((await getFeed(await ctxFor(s.groupMate, s.org))).items.map((i) => i.title)).toEqual(["Group one"]);
    expect((await getFeed(await ctxFor(s.other, s.org))).items).toHaveLength(0);
  });

  it("strips every author detail from anonymous posts for other members", async () => {
    const s = await setup();
    await createPrayerRequest(await ctxFor(s.author, s.org), req({ anonymous: "on" }));
    await submitTestimony(await ctxFor(s.author, s.org), { title: "Healed", body: "Thank you Lord", audience: "MEMBERS", consent: "on" });
    const items = (await getFeed(await ctxFor(s.other, s.org))).items;
    expect(items).toHaveLength(2);
    for (const i of items) {
      if (i.kind !== "prayer" && i.kind !== "testimony") throw new Error("unexpected kind");
      expect(i.author).toEqual({ id: "", name: "Anonymous", displayName: null, avatarUrl: null });
    }
    // The author still sees themselves.
    const mine = (await getFeed(await ctxFor(s.author, s.org))).items;
    expect(mine.every((i) => (i.kind === "prayer" || i.kind === "testimony") && i.author.id === s.author.id)).toBe(true);
  });

  it("reports prayer and amen state for the viewer", async () => {
    const s = await setup();
    const pr = await createPrayerRequest(await ctxFor(s.author, s.org), req());
    await acknowledgePrayer(await ctxFor(s.other, s.org), pr.id);
    const item = (await getFeed(await ctxFor(s.other, s.org))).items[0]!;
    expect(item.kind === "prayer" && item.iPrayed && item.prayed === 1).toBe(true);
  });

  it("pages through older posts without repeating any", async () => {
    const s = await setup();
    const ctx = await ctxFor(s.author, s.org);
    for (let i = 0; i < 20; i++) {
      const p = await createPrayerRequest(ctx, req({ title: `Request ${i}` }));
      await db.prayerRequest.update({ where: { id: p.id }, data: { createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)) } });
    }
    const first = await getFeed(ctx);
    const second = await getFeed(ctx, { before: first.nextBefore! });
    const titles = [...first.items, ...second.items].map((i) => i.title);
    expect(titles).toHaveLength(20);
    expect(new Set(titles).size).toBe(20);
    expect(second.nextBefore).toBeNull();
  });
});

describe("encouragements", () => {
  it("follow the visibility of the prayer request", async () => {
    const s = await setup();
    const pr = await createPrayerRequest(await ctxFor(s.author, s.org), req({ visibility: "GROUP", groupId: s.group.id }));
    await addComment(await ctxFor(s.groupMate, s.org), { kind: "prayer", id: pr.id }, { body: "Standing with you" });
    await expect(listComments(await ctxFor(s.other, s.org), { kind: "prayer", id: pr.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(addComment(await ctxFor(s.other, s.org), { kind: "prayer", id: pr.id }, { body: "Hi" })).rejects.toBeInstanceOf(NotFoundError);
    const list = await listComments(await ctxFor(s.author, s.org), { kind: "prayer", id: pr.id });
    expect(list.map((c) => c.body)).toEqual(["Standing with you"]);
    const notes = await db.notification.findMany({ where: { userId: s.author.id } });
    expect(notes.some((n) => n.title.includes("encouragement"))).toBe(true);
  });

  it("can be removed by their writer, the post's author or a moderator — nobody else", async () => {
    const s = await setup();
    const pr = await createPrayerRequest(await ctxFor(s.author, s.org), req());
    const target = { kind: "prayer" as const, id: pr.id };
    const c1 = await addComment(await ctxFor(s.groupMate, s.org), target, { body: "One" });
    const c2 = await addComment(await ctxFor(s.groupMate, s.org), target, { body: "Two" });
    const c3 = await addComment(await ctxFor(s.groupMate, s.org), target, { body: "Three" });
    await expect(deleteComment(await ctxFor(s.other, s.org), c1.id)).rejects.toBeInstanceOf(NotFoundError);
    await deleteComment(await ctxFor(s.groupMate, s.org), c1.id);
    await deleteComment(await ctxFor(s.author, s.org), c2.id);
    await deleteComment(await ctxFor(s.moderator, s.org), c3.id);
    expect(await db.postComment.count()).toBe(0);
  });

  it("are not visible across organisations", async () => {
    const s = await setup();
    const pr = await createPrayerRequest(await ctxFor(s.author, s.org), req());
    const outsider = await createUser();
    const otherOrg = await createOrg(outsider);
    await expect(addComment(await ctxFor(outsider, otherOrg), { kind: "prayer", id: pr.id }, { body: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("amen", () => {
  it("toggles and is unavailable on testimonies awaiting review", async () => {
    const s = await setup();
    await db.organization.update({ where: { id: s.org.id }, data: { moderateTestimonies: true } });
    const t = await submitTestimony(await ctxFor(s.author, s.org), { title: "Provision", body: "Rent was paid", audience: "MEMBERS", consent: "on" });
    await expect(toggleAmen(await ctxFor(s.other, s.org), t.id)).rejects.toBeInstanceOf(NotFoundError);
    await db.testimony.update({ where: { id: t.id }, data: { moderationStatus: "APPROVED", publishedAt: new Date() } });
    expect(await toggleAmen(await ctxFor(s.other, s.org), t.id)).toBe(true);
    expect(await toggleAmen(await ctxFor(s.other, s.org), t.id)).toBe(false);
    expect(await toggleAmen(await ctxFor(s.other, s.org), t.id)).toBe(true);
    expect(await db.testimonyReaction.count({ where: { testimonyId: t.id } })).toBe(1);
  });
});
