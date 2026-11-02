import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../support/db";
import { createOrg, createUser } from "../support/factories";
import { cleanup } from "@/server/jobs/tick";

beforeEach(resetDb);

describe("retention cleanup", () => {
  it("purges old operational data but never financial records", async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    const old = new Date(Date.now() - 400 * 86400_000);
    await db.emailOutbox.create({ data: { to: "a@x.test", subject: "s", textBody: "t", category: "X", status: "SENT", createdAt: old } });
    await db.emailOutbox.create({ data: { to: "a@x.test", subject: "s", textBody: "t", category: "X", status: "PENDING", createdAt: old } });
    await db.notification.create({ data: { userId: owner.id, category: "MEETINGS", title: "x", readAt: old, createdAt: old } });
    await db.notification.create({ data: { userId: owner.id, category: "MEETINGS", title: "unread", createdAt: old } });
    const conn = await db.paymentProviderConnection.create({ data: { organizationId: org.id, provider: "SIMULATOR", createdById: owner.id } });
    const d = await db.donation.create({ data: { organizationId: org.id, connectionId: conn.id, provider: "SIMULATOR", reference: "don_retention_test", currency: "NGN", amount: 100, status: "SUCCEEDED", createdAt: old } });
    await db.ledgerEntry.create({ data: { organizationId: org.id, donationId: d.id, type: "CHARGE", amount: 100, currency: "NGN", sourceEventId: "e", createdAt: old } });

    const removed = await cleanup(new Date());
    expect(removed).toBeGreaterThanOrEqual(2);
    expect(await db.emailOutbox.count()).toBe(1); // pending mail is kept for retry
    expect(await db.notification.count()).toBe(1); // unread kept
    expect(await db.donation.count()).toBe(1);
    expect(await db.ledgerEntry.count()).toBe(1);
  });
});
