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

// ---------------------------------------------------------------------------------------------
// Sessions, reactions and profiles
// ---------------------------------------------------------------------------------------------

import { createMeeting, recordJoinIntent } from "@/server/meetings/service";
import { getMemberProfile, getSessionHighlights, react, toggleSessionInterest } from "@/server/social/service";

const meeting = (o: Record<string, unknown> = {}) => {
  const d = new Date(Date.now() + 30 * 60_000);
  return {
    title: "Night watch", mode: "WHATSAPP", externalUrl: "https://chat.whatsapp.com/abc", format: "INTERACTIVE", visibility: "MEMBERS",
    timezone: "UTC", startDate: d.toISOString().slice(0, 10), startTime: d.toISOString().slice(11, 16), durationMinutes: "60", frequency: "NONE", ...o,
  };
};

async function occurrenceOf(meetingId: string) {
  return db.meetingOccurrence.findFirstOrThrow({ where: { meetingId } });
}

describe("prayer sessions in the feed", () => {
  it("shows who joined a live session and who is interested in an upcoming one", async () => {
    const s = await setup();
    const live = await occurrenceOf((await createMeeting(await ctxFor(s.owner, s.org), meeting({ title: "Live now" }))).id);
    await db.meetingOccurrence.update({ where: { id: live.id }, data: { startsAt: new Date(Date.now() - 10 * 60_000), endsAt: new Date(Date.now() + 50 * 60_000) } });
    await recordJoinIntent(await ctxFor(s.author, s.org), live.id);
    await recordJoinIntent(await ctxFor(s.author, s.org), live.id); // tapping twice counts once
    const upcoming = await occurrenceOf((await createMeeting(await ctxFor(s.owner, s.org), meeting({ title: "Later" }))).id);
    expect(await toggleSessionInterest(await ctxFor(s.other, s.org), upcoming.id)).toBe(true);

    const cards = await getSessionHighlights(await ctxFor(s.groupMate, s.org));
    const l = cards.find((c) => c.title === "Live now")!;
    expect(l.state).toBe("live");
    expect(l.joined.map((p) => p.id)).toEqual([s.author.id]);
    const u = cards.find((c) => c.title === "Later")!;
    expect(u.state).toBe("soon");
    expect(u.interested.map((p) => p.id)).toEqual([s.other.id]);
    expect(u.iAmInterested).toBe(false);
    expect(await toggleSessionInterest(await ctxFor(s.other, s.org), upcoming.id)).toBe(false);
  });

  it("keeps group sessions to the group", async () => {
    const s = await setup();
    const occ = await occurrenceOf((await createMeeting(await ctxFor(s.owner, s.org), meeting({ visibility: "GROUP", groupId: s.group.id }))).id);
    expect(await getSessionHighlights(await ctxFor(s.other, s.org))).toHaveLength(0);
    await expect(toggleSessionInterest(await ctxFor(s.other, s.org), occ.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await getSessionHighlights(await ctxFor(s.groupMate, s.org))).toHaveLength(1);
  });

  it("puts finished sessions with participants in the timeline", async () => {
    const s = await setup();
    const done = await occurrenceOf((await createMeeting(await ctxFor(s.owner, s.org), meeting({ title: "Done" }))).id);
    const empty = await occurrenceOf((await createMeeting(await ctxFor(s.owner, s.org), meeting({ title: "Nobody came" }))).id);
    await recordJoinIntent(await ctxFor(s.author, s.org), done.id);
    for (const o of [done, empty]) await db.meetingOccurrence.update({ where: { id: o.id }, data: { startsAt: new Date(Date.now() - 2 * 3600_000), endsAt: new Date(Date.now() - 3600_000) } });
    const items = (await getFeed(await ctxFor(s.other, s.org), { filter: "sessions" })).items;
    expect(items.map((i) => i.title)).toEqual(["Done"]);
    expect(items[0]!.kind === "session" && items[0]!.joined.length === 1).toBe(true);
  });
});

describe("reactions", () => {
  it("allow one reaction per member, switchable and removable, summarised in the feed", async () => {
    const s = await setup();
    const t = await submitTestimony(await ctxFor(s.author, s.org), { title: "Healed", body: "Praise God", audience: "MEMBERS", consent: "on" });
    expect(await react(await ctxFor(s.other, s.org), t.id, "LOVE")).toBe("LOVE");
    expect(await react(await ctxFor(s.other, s.org), t.id, "PRAISE")).toBe("PRAISE");
    await react(await ctxFor(s.groupMate, s.org), t.id, "PRAISE");
    const item = (await getFeed(await ctxFor(s.other, s.org), { filter: "testimonies" })).items[0]!;
    if (item.kind !== "testimony") throw new Error("expected testimony");
    expect(item.reactions).toEqual({ counts: { AMEN: 0, PRAISE: 2, LOVE: 0 }, total: 2, mine: "PRAISE" });
    expect(await react(await ctxFor(s.other, s.org), t.id, "PRAISE")).toBeNull();
  });
});

describe("member profiles", () => {
  it("show only posts that carry the member's name and that the viewer may read", async () => {
    const s = await setup();
    const actx = await ctxFor(s.author, s.org);
    await createPrayerRequest(actx, req({ title: "Named" }));
    await createPrayerRequest(actx, req({ title: "Anon", anonymous: "on" }));
    await createPrayerRequest(actx, req({ title: "Private", visibility: "PRIVATE" }));
    await createPrayerRequest(actx, req({ title: "Group only", visibility: "GROUP", groupId: s.group.id }));
    await submitTestimony(actx, { title: "Unnamed testimony", body: "God is faithful", audience: "MEMBERS", consent: "on" });

    const seenByOther = await getMemberProfile(await ctxFor(s.other, s.org), s.author.id);
    expect(seenByOther.posts.items.map((i) => i.title)).toEqual(["Named"]);
    expect(seenByOther.sharedGroups).toEqual([]);

    const seenByGroupMate = await getMemberProfile(await ctxFor(s.groupMate, s.org), s.author.id);
    expect(seenByGroupMate.posts.items.map((i) => i.title).sort()).toEqual(["Group only", "Named"]);
    expect(seenByGroupMate.sharedGroups.map((g) => g.id)).toEqual([s.group.id]);
  });

  it("are not available across organisations or for former members", async () => {
    const s = await setup();
    const outsider = await createUser();
    const otherOrg = await createOrg(outsider);
    await expect(getMemberProfile(await ctxFor(outsider, otherOrg), s.author.id)).rejects.toBeInstanceOf(NotFoundError);
    await db.membership.updateMany({ where: { userId: s.author.id, organizationId: s.org.id }, data: { status: "LEFT" } });
    await expect(getMemberProfile(await ctxFor(s.other, s.org), s.author.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("private attendance", () => {
  it("sends only counts, never people, for sessions marked private", async () => {
    const s = await setup();
    const octx = await ctxFor(s.owner, s.org);
    const live = await occurrenceOf((await createMeeting(octx, meeting({ title: "Private live", attendancePrivate: "on" }))).id);
    await db.meetingOccurrence.update({ where: { id: live.id }, data: { startsAt: new Date(Date.now() - 600_000), endsAt: new Date(Date.now() + 3_000_000) } });
    await recordJoinIntent(await ctxFor(s.author, s.org), live.id);
    await recordJoinIntent(await ctxFor(s.groupMate, s.org), live.id);
    const later = await occurrenceOf((await createMeeting(octx, meeting({ title: "Private later", attendancePrivate: "on" }))).id);
    await toggleSessionInterest(await ctxFor(s.author, s.org), later.id);
    await toggleSessionInterest(await ctxFor(s.other, s.org), later.id);

    const cards = await getSessionHighlights(await ctxFor(s.other, s.org));
    const l = cards.find((c) => c.title === "Private live")!;
    expect(l).toMatchObject({ attendancePrivate: true, joined: [], joinedCount: 2 });
    const u = cards.find((c) => c.title === "Private later")!;
    expect(u).toMatchObject({ attendancePrivate: true, interested: [], interestedCount: 2, iAmInterested: true });

    await db.meetingOccurrence.update({ where: { id: live.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    const item = (await getFeed(await ctxFor(s.other, s.org), { filter: "sessions" })).items[0]!;
    expect(item).toMatchObject({ kind: "session", attendancePrivate: true, joined: [], joinedCount: 2 });
  });

  it("still shows faces for ordinary sessions, with exact totals", async () => {
    const s = await setup();
    const live = await occurrenceOf((await createMeeting(await ctxFor(s.owner, s.org), meeting({ title: "Open" }))).id);
    await db.meetingOccurrence.update({ where: { id: live.id }, data: { startsAt: new Date(Date.now() - 600_000), endsAt: new Date(Date.now() + 3_000_000) } });
    for (const u of [s.author, s.groupMate, s.coordinator]) await recordJoinIntent(await ctxFor(u, s.org), live.id);
    const c = (await getSessionHighlights(await ctxFor(s.other, s.org)))[0]!;
    expect(c.attendancePrivate).toBe(false);
    expect(c.joinedCount).toBe(3);
    expect(c.joined.map((p) => p.id).sort()).toEqual([s.author.id, s.groupMate.id, s.coordinator.id].sort());
  });
});
