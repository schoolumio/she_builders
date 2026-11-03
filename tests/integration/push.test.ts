import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../support/db";
import { createUser } from "../support/factories";
import { isAllowedPushEndpoint, saveSubscription, sendPushToUsers, setPushSender, type PushPayload, type PushTarget } from "@/server/push";
import { notify, updatePreference } from "@/server/notifications";
import { ValidationError } from "@/server/errors";

class FakeSender {
  sent: { target: PushTarget; payload: PushPayload }[] = [];
  gone = new Set<string>();
  async send(target: PushTarget, payload: PushPayload) {
    if (this.gone.has(target.endpoint)) return { ok: false as const, gone: true, status: 410 };
    this.sent.push({ target, payload });
    return { ok: true as const };
  }
}

let fake: FakeSender;
beforeAll(() => {
  process.env.VAPID_PUBLIC_KEY = "BTestPublicKey";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  process.env.VAPID_SUBJECT = "mailto:test@example.test";
});
afterAll(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
  setPushSender(undefined);
});
beforeEach(async () => {
  await resetDb();
  fake = new FakeSender();
  setPushSender(fake);
});

const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
const fcm = (n: number) => `https://fcm.googleapis.com/fcm/send/test-${n}`;

describe("browser push", () => {
  it("only stores endpoints on real browser push services", async () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://169.254.169.254/latest")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.test/x")).toBe(false);
    const u = await createUser();
    await expect(saveSubscription(u.id, { endpoint: "https://internal.example/hook", keys })).rejects.toBeInstanceOf(ValidationError);
  });

  it("delivers notifications to subscribed browsers, honouring category preferences", async () => {
    const u = await createUser();
    await saveSubscription(u.id, { endpoint: fcm(1), keys });
    await notify({ userIds: [u.id], category: "MEETINGS", title: "Starting soon: Night prayer", body: "21:00", link: "/o/x/meetings/1" });
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]!.payload).toMatchObject({ title: "Starting soon: Night prayer", link: "/o/x/meetings/1", tag: "MEETINGS" });

    await updatePreference(u.id, "ANNOUNCEMENTS", { push: false });
    await notify({ userIds: [u.id], category: "ANNOUNCEMENTS", title: "News" });
    expect(fake.sent).toHaveLength(1);
    expect(await db.notification.count({ where: { userId: u.id } })).toBe(2); // still in-app
  });

  it("removes expired subscriptions and never sends off-site links", async () => {
    const u = await createUser();
    await saveSubscription(u.id, { endpoint: fcm(2), keys });
    await saveSubscription(u.id, { endpoint: fcm(3), keys });
    fake.gone.add(fcm(2));
    expect(await sendPushToUsers([u.id], { title: "Hi", link: "https://evil.test/phish" })).toBe(1);
    expect(fake.sent[0]!.payload.link).toBe("/app/notifications");
    expect(await db.pushSubscription.count({ where: { userId: u.id } })).toBe(1);
  });

  it("moves an endpoint to whoever subscribed it last", async () => {
    const a = await createUser();
    const b = await createUser();
    await saveSubscription(a.id, { endpoint: fcm(4), keys });
    await saveSubscription(b.id, { endpoint: fcm(4), keys });
    expect((await db.pushSubscription.findUniqueOrThrow({ where: { endpoint: fcm(4) } })).userId).toBe(b.id);
  });
});
