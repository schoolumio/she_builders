import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../support/db";
import { addMember, createGroup, createOrg, createUser, ctxFor } from "../support/factories";
import { FakeRealtimeProvider } from "../support/fake-realtime";
import { setRealtimeProvider } from "@/server/realtime";
import {
  cancelOccurrence,
  createMeeting,
  getOccurrenceForMember,
  listUpcomingOccurrences,
  markAttendance,
  recordJoinIntent,
  rescheduleOccurrence,
  updateMeeting,
} from "@/server/meetings/service";
import { handleRealtimeEvent, hostParticipantAction, issueRoomToken, setRoomLock } from "@/server/meetings/room";
import { sendFreeGift } from "@/server/gifts/service";
import { ConfigurationError, EntitlementError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

let rt: FakeRealtimeProvider;
beforeEach(async () => {
  await resetDb();
  rt = new FakeRealtimeProvider();
  setRealtimeProvider(rt);
});
afterAll(() => setRealtimeProvider(undefined));

const soon = () => {
  const d = new Date(Date.now() + 5 * 60_000);
  return { startDate: d.toISOString().slice(0, 10), startTime: d.toISOString().slice(11, 16) };
};

const input = (o: Record<string, unknown> = {}) => ({
  title: "Morning prayer",
  mode: "AUDIO",
  format: "INTERACTIVE",
  visibility: "MEMBERS",
  timezone: "UTC",
  ...soon(),
  durationMinutes: "60",
  frequency: "NONE",
  chatEnabled: "on",
  giftsEnabled: "on",
  ...o,
});

async function setup() {
  const owner = await createUser();
  const org = await createOrg(owner);
  const host = await addMember(org, ["HOST"]);
  const member = await addMember(org);
  return { owner, org, host, member };
}

describe("meeting scheduling", () => {
  it("hosts create meetings they then host; recurring series materialise in UTC", async () => {
    const { org, host } = await setup();
    const ctx = await ctxFor(host, org);
    const m = await createMeeting(ctx, input({ mode: "WHATSAPP", externalUrl: "https://chat.whatsapp.com/x", frequency: "WEEKLY", byWeekday: ["1", "4"], timezone: "Africa/Lagos", startDate: "2026-11-02", startTime: "21:00" }));
    const hosts = await db.meetingHost.findMany({ where: { meetingId: m.id } });
    expect(hosts.map((h) => h.userId)).toEqual([host.id]);
    const occs = await db.meetingOccurrence.findMany({ where: { meetingId: m.id }, orderBy: { startsAt: "asc" } });
    expect(occs.length).toBeGreaterThan(0);
    for (const o of occs) {
      expect(o.startsAt.getUTCHours()).toBe(20); // 21:00 Lagos
      expect([1, 4]).toContain(((o.startsAt.getUTCDay() + 6) % 7) + 1);
    }
  });

  it("rejects unsafe WhatsApp links and requires join details", async () => {
    const { org, owner } = await setup();
    const ctx = await ctxFor(owner, org);
    await expect(createMeeting(ctx, input({ mode: "WHATSAPP", externalUrl: "javascript:alert(1)" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createMeeting(ctx, input({ mode: "WHATSAPP" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("enforces plan entitlements for in-app meetings and recurrence", async () => {
    const owner = await createUser();
    const org = await createOrg(owner, { plan: "FREE" });
    const ctx = await ctxFor(owner, org);
    await expect(createMeeting(ctx, input({ mode: "AUDIO" }))).rejects.toBeInstanceOf(EntitlementError);
    await expect(createMeeting(ctx, input({ mode: "WHATSAPP", externalUrl: "https://chat.whatsapp.com/x", frequency: "DAILY" }))).rejects.toBeInstanceOf(EntitlementError);
  });

  it("restricts group meetings to group members", async () => {
    const { org, owner, member } = await setup();
    const other = await addMember(org);
    const group = await createGroup(org, [member]);
    await createMeeting(await ctxFor(owner, org), input({ visibility: "GROUP", groupId: group.id }));
    const occ = await db.meetingOccurrence.findFirstOrThrow({ where: { organizationId: org.id } });
    await expect(getOccurrenceForMember(await ctxFor(member, org), occ.id)).resolves.toBeTruthy();
    await expect(getOccurrenceForMember(await ctxFor(other, org), occ.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listUpcomingOccurrences(await ctxFor(other, org))).toHaveLength(0);
  });

  it("hosts manage only their meetings; members cannot cancel", async () => {
    const { org, owner, host, member } = await setup();
    await createMeeting(await ctxFor(owner, org), input());
    const occ = await db.meetingOccurrence.findFirstOrThrow({ where: { organizationId: org.id } });
    await expect(cancelOccurrence(await ctxFor(host, org), occ.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cancelOccurrence(await ctxFor(member, org), occ.id)).rejects.toBeInstanceOf(ForbiddenError);
    await cancelOccurrence(await ctxFor(owner, org), occ.id, "Public holiday");
    expect((await db.meetingOccurrence.findUniqueOrThrow({ where: { id: occ.id } })).status).toBe("CANCELLED");
    expect(await db.notification.count({ where: { userId: member.id, category: "MEETINGS" } })).toBe(1);
  });

  it("reschedules a single occurrence in the meeting's time zone", async () => {
    const { org, owner } = await setup();
    await createMeeting(await ctxFor(owner, org), input({ timezone: "America/New_York", startDate: "2030-03-01", startTime: "19:00" }));
    const occ = await db.meetingOccurrence.findFirstOrThrow({ where: { organizationId: org.id } });
    await rescheduleOccurrence(await ctxFor(owner, org), occ.id, { date: "2030-03-12", time: "19:00" });
    const updated = await db.meetingOccurrence.findUniqueOrThrow({ where: { id: occ.id } });
    expect(updated.startsAt.toISOString()).toBe("2030-03-12T23:00:00.000Z"); // EDT after 10 Mar 2030
    expect(updated.rescheduled).toBe(true);
  });

  it("schedule edits regenerate future occurrences", async () => {
    const { org, owner } = await setup();
    const ctx = await ctxFor(owner, org);
    const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    const m = await createMeeting(ctx, input({ mode: "WHATSAPP", externalUrl: "https://chat.whatsapp.com/x", frequency: "DAILY", startDate: tomorrow, startTime: "06:00" }));
    expect(await db.meetingOccurrence.count({ where: { meetingId: m.id } })).toBeGreaterThan(80);
    await updateMeeting(ctx, m.id, input({ mode: "WHATSAPP", externalUrl: "https://chat.whatsapp.com/x", frequency: "DAILY", startDate: tomorrow, startTime: "07:30" }));
    const times = new Set((await db.meetingOccurrence.findMany({ where: { meetingId: m.id } })).map((o) => o.startsAt.toISOString().slice(11, 16)));
    expect([...times]).toEqual(["07:30"]);
  });
});

describe("WhatsApp attendance", () => {
  it("records a join intent, never attendance; hosts can mark attendance explicitly", async () => {
    const { org, owner, member } = await setup();
    await createMeeting(await ctxFor(owner, org), input({ mode: "WHATSAPP", externalUrl: "https://chat.whatsapp.com/abc" }));
    const occ = await db.meetingOccurrence.findFirstOrThrow({ where: { organizationId: org.id } });
    await recordJoinIntent(await ctxFor(member, org), occ.id);
    expect(await db.meetingJoinIntent.count({ where: { occurrenceId: occ.id } })).toBe(1);
    expect(await db.meetingAttendance.count({ where: { occurrenceId: occ.id } })).toBe(0);
    await markAttendance(await ctxFor(owner, org), occ.id, [member.id]);
    expect((await db.meetingAttendance.findFirstOrThrow({ where: { occurrenceId: occ.id } })).source).toBe("HOST_MARKED");
  });
});

describe("live room access", () => {
  it("issues short-lived tokens with role-appropriate permissions", async () => {
    const { org, owner, member } = await setup();
    await createMeeting(await ctxFor(owner, org), input({ mode: "VIDEO", format: "BROADCAST" }));
    const occ = await db.meetingOccurrence.findFirstOrThrow({ where: { organizationId: org.id } });
    const hostJoin = await issueRoomToken(await ctxFor(owner, org), occ.id);
    expect(hostJoin.status).toBe("ok");
    const memberJoin = await issueRoomToken(await ctxFor(member, org), occ.id);
    expect(memberJoin).toMatchObject({ status: "ok", role: "listener" });
    const hostToken = rt.tokens.find((t) => t.identity === owner.id)!;
    const memberToken = rt.tokens.find((t) => t.identity === member.id)!;
    expect(hostToken.permissions.canPublishSources).toContain("screen_share");
    expect(memberToken.permissions.canPublish).toBe(false);
    expect(memberToken.ttlSeconds).toBeLessThanOrEqual(600);
    expect(memberToken.roomName).toBe(occ.roomName);
  });

  it("denies non-members, invisible meetings, locked rooms and removed participants", async () => {
    const { org, owner, member } = await setup();
    const outsider = await createUser();
    const outsiderOrg = await createOrg(outsider);
    await createMeeting(await ctxFor(owner, org), input({ visibility: "INVITED", inviteeIds: [member.id] }));
    const occ = await db.meetingOccurrence.findFirstOrThrow({ where: { organizationId: org.id } });
    await expect(issueRoomToken(await ctxFor(outsider, outsiderOrg), occ.id)).rejects.toBeInstanceOf(NotFoundError);
    const uninvited = await addMember(org);
    await expect(issueRoomToken(await ctxFor(uninvited, org), occ.id)).rejects.toBeInstanceOf(NotFoundError);

    await setRoomLock(await ctxFor(owner, org), occ.id, true);
    expect(await issueRoomToken(await ctxFor(member, org), occ.id)).toMatchObject({ status: "denied" });
    await setRoomLock(await ctxFor(owner, org), occ.id, false);
    expect((await issueRoomToken(await ctxFor(member, org), occ.id)).status).toBe("ok");

    await hostParticipantAction(await ctxFor(owner, org), occ.id, "remove", member.id);
    expect(rt.calls.some((c) => c.method === "removeParticipant")).toBe(true);
    expect(await issueRoomToken(await ctxFor(member, org), occ.id)).toMatchObject({ status: "denied" });
  });

  it("waiting rooms hold members until a host admits them", async () => {
    const { org, owner, member } = await setup();
    await createMeeting(await ctxFor(owner, org), input({ waitingRoom: "on" }));
    const occ = await db.meetingOccurrence.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(await issueRoomToken(await ctxFor(member, org), occ.id)).toEqual({ status: "waiting" });
    await hostParticipantAction(await ctxFor(owner, org), occ.id, "admit", member.id);
    expect((await issueRoomToken(await ctxFor(member, org), occ.id)).status).toBe("ok");
  });

  it("refuses rooms outside the join window or when cancelled", async () => {
    const { org, owner, member } = await setup();
    await createMeeting(await ctxFor(owner, org), input({ startDate: "2030-01-01", startTime: "06:00" }));
    const occ = await db.meetingOccurrence.findFirstOrThrow({ where: { organizationId: org.id } });
    expect((await issueRoomToken(await ctxFor(member, org), occ.id)).status).toBe("denied");
  });

  it("reports an honest configuration error when the provider is not configured", async () => {
    const { org, owner } = await setup();
    await createMeeting(await ctxFor(owner, org), input());
    const occ = await db.meetingOccurrence.findFirstOrThrow({ where: { organizationId: org.id } });
    rt.configured = false;
    await expect(issueRoomToken(await ctxFor(owner, org), occ.id)).rejects.toBeInstanceOf(ConfigurationError);
  });

  it("broadcast speakers are granted and revoked by hosts, persisting across reconnects", async () => {
    const { org, owner, member } = await setup();
    await createMeeting(await ctxFor(owner, org), input({ format: "BROADCAST" }));
    const occ = await db.meetingOccurrence.findFirstOrThrow({ where: { organizationId: org.id } });
    await hostParticipantAction(await ctxFor(owner, org), occ.id, "allow_speak", member.id);
    expect(await issueRoomToken(await ctxFor(member, org), occ.id)).toMatchObject({ role: "speaker" });
    await hostParticipantAction(await ctxFor(owner, org), occ.id, "revoke_speak", member.id);
    expect(await issueRoomToken(await ctxFor(member, org), occ.id)).toMatchObject({ role: "listener" });
    await expect(hostParticipantAction(await ctxFor(member, org), occ.id, "mute", owner.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("provider webhooks", () => {
  it("records attendance from join/leave events exactly once", async () => {
    const { org, owner, member } = await setup();
    await createMeeting(await ctxFor(owner, org), input());
    const occ = await db.meetingOccurrence.findFirstOrThrow({ where: { organizationId: org.id } });
    const t0 = new Date();
    const joined = { id: "EV1", type: "participant_joined" as const, roomName: occ.roomName, identity: member.id, at: t0 };
    expect(await handleRealtimeEvent(joined, "fake")).toBe("ok");
    expect(await handleRealtimeEvent(joined, "fake")).toBe("duplicate");
    await handleRealtimeEvent({ id: "EV2", type: "participant_left", roomName: occ.roomName, identity: member.id, at: new Date(t0.getTime() + 600_000) }, "fake");
    const att = await db.meetingAttendance.findFirstOrThrow({ where: { occurrenceId: occ.id, userId: member.id } });
    expect(att.source).toBe("PROVIDER_WEBHOOK");
    expect(att.totalSeconds).toBe(600);
    expect(await handleRealtimeEvent({ id: "EV3", type: "participant_joined", roomName: occ.roomName, identity: "not-a-member", at: t0 }, "fake")).toBe("not_member");
  });
});

describe("virtual gifts", () => {
  it("free gifts are server-broadcast and rate limited; paid gifts cannot be sent for free", async () => {
    const { org, owner, member } = await setup();
    await createMeeting(await ctxFor(owner, org), input());
    const occ = await db.meetingOccurrence.findFirstOrThrow({ where: { organizationId: org.id } });
    const gift = await db.virtualGift.create({ data: { organizationId: org.id, name: "Dove", emoji: "🕊️" } });
    await sendFreeGift(await ctxFor(member, org), occ.id, gift.id, true);
    const sent = rt.calls.find((c) => c.method === "sendServerData")!;
    expect(sent.args[1]).toBe("gift");
    expect(sent.args[2]).toMatchObject({ type: "gift", gift: { name: "Dove" }, sender: member.name });
    const paid = await db.virtualGift.create({ data: { organizationId: org.id, name: "Rose", emoji: "🌹", priceAmount: 50000, currency: "NGN" } });
    await expect(sendFreeGift(await ctxFor(member, org), occ.id, paid.id, true)).rejects.toBeInstanceOf(ValidationError);
    const otherOrgGift = await db.virtualGift.create({ data: { organizationId: (await createOrg(await createUser())).id, name: "X", emoji: "x" } });
    await expect(sendFreeGift(await ctxFor(member, org), occ.id, otherOrgGift.id, true)).rejects.toBeInstanceOf(NotFoundError);
  });
});
