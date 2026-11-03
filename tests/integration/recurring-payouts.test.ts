import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../support/db";
import { addMember, createOrg, createUser, ctxFor } from "../support/factories";
import { refreshConnection, setFundraisingEnabled, startOnboarding } from "@/server/payments/connections";
import { createCampaign, decideCampaign } from "@/server/payments/campaigns";
import { financeSummary, startDonation } from "@/server/payments/donations";
import { cancelMyRecurringDonation, cancelRecurringForOrganisation, createRecurringCheckout } from "@/server/payments/recurring";
import { importSettlements, applySettlement } from "@/server/payments/settlements";
import { processPaymentEvent } from "@/server/payments/events";
import { getSimulator } from "@/server/payments/providers";
import { SIMULATOR_SIGNATURE_HEADER } from "@/server/payments/providers/simulator";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

beforeEach(resetDb);
const meta = { ipHash: "t" };

async function setup(allowRecurring = true) {
  const owner = await createUser();
  const org = await createOrg(owner);
  const finance = await addMember(org, ["FINANCE_ADMIN"]);
  const donor = await addMember(org);
  const fctx = await ctxFor(finance, org);
  const { connection } = await startOnboarding(fctx, "SIMULATOR", {});
  await getSimulator().setAccountStatus(connection.providerAccountId!, "verified");
  await refreshConnection(fctx, connection.id);
  await setFundraisingEnabled(fctx, true);
  const campaign = await createCampaign(fctx, {
    title: "Monthly support",
    description: "Ongoing ministry support for the community.",
    purpose: "GENERAL",
    currency: "NGN",
    allowCustomAmount: "on",
    allowGuests: "on",
    visibility: "PUBLIC",
    ...(allowRecurring ? { allowRecurring: "on" } : {}),
  });
  await decideCampaign(fctx, campaign.id, "approve");
  return { org, finance, donor, fctx, campaign, accountId: connection.providerAccountId! };
}

async function deliver(hooks: { raw: string; signature: string } | { raw: string; signature: string }[]) {
  const out = [];
  for (const h of Array.isArray(hooks) ? hooks : [hooks]) {
    const ev = await getSimulator().parseWebhook(h.raw, new Headers({ [SIMULATOR_SIGNATURE_HEADER]: h.signature }));
    out.push(await processPaymentEvent("SIMULATOR", ev));
  }
  return out;
}

async function startMonthly(s: Awaited<ReturnType<typeof setup>>, amount = "2000") {
  const r = await startDonation(s.donor, s.org.slug, s.campaign.id, { amount, frequency: "MONTHLY", currency: "USD" }, meta);
  expect(r.recurring).toBe(true);
  await createRecurringCheckout(r.reference, s.donor.id);
  return r.reference;
}

describe("recurring donations", () => {
  it("require a signed-in donor and a campaign that offers them", async () => {
    const s = await setup();
    await expect(startDonation(null, s.org.slug, s.campaign.id, { amount: "1000", frequency: "MONTHLY", donorEmail: "g@x.test" }, meta)).rejects.toBeInstanceOf(ForbiddenError);
    const t = await setup(false);
    await expect(startDonation(t.donor, t.org.slug, t.campaign.id, { amount: "1000", frequency: "MONTHLY" }, meta)).rejects.toBeInstanceOf(ValidationError);
  });

  it("activate through the provider and record each charge as its own donation, once", async () => {
    const s = await setup();
    const reference = await startMonthly(s);
    const rec = await db.recurringDonation.findUniqueOrThrow({ where: { reference } });
    expect(rec).toMatchObject({ status: "PENDING_SETUP", amount: 200000, currency: "NGN", organizationId: s.org.id });

    const hooks = await getSimulator().activateSubscription(reference);
    expect(await deliver(hooks)).toEqual(["processed", "processed"]);
    expect(await deliver(hooks)).toEqual(["duplicate", "duplicate"]);
    let r = await db.recurringDonation.findUniqueOrThrow({ where: { reference }, include: { charges: { include: { ledgerEntries: true } } } });
    expect(r.status).toBe("ACTIVE");
    expect(r.chargesCount).toBe(1);
    expect(r.nextChargeAt).not.toBeNull();
    expect(r.charges).toHaveLength(1);
    expect(r.charges[0]!.status).toBe("SUCCEEDED");
    expect(r.charges[0]!.ledgerEntries.filter((l) => l.type === "CHARGE")).toHaveLength(1);

    await deliver(await getSimulator().chargeSubscription(r.providerSubscriptionId!, "succeeded"));
    r = await db.recurringDonation.findUniqueOrThrow({ where: { reference }, include: { charges: { include: { ledgerEntries: true } } } });
    expect(r.chargesCount).toBe(2);
    expect(r.charges.filter((c) => c.status === "SUCCEEDED")).toHaveLength(2);
    expect(await db.emailOutbox.count({ where: { to: s.donor.email, category: "FUNDRAISING" } })).toBe(2); // one receipt per charge
  });

  it("marks failed charges past due, notifies the donor, and recovers on the next success", async () => {
    const s = await setup();
    const reference = await startMonthly(s);
    await deliver(await getSimulator().activateSubscription(reference));
    const rec = await db.recurringDonation.findUniqueOrThrow({ where: { reference } });
    await deliver(await getSimulator().chargeSubscription(rec.providerSubscriptionId!, "failed"));
    expect((await db.recurringDonation.findUniqueOrThrow({ where: { reference } })).status).toBe("PAST_DUE");
    expect(await db.notification.count({ where: { userId: s.donor.id, category: "FUNDRAISING", title: { contains: "didn't go through" } } })).toBe(1);
    await deliver(await getSimulator().chargeSubscription(rec.providerSubscriptionId!, "succeeded"));
    expect((await db.recurringDonation.findUniqueOrThrow({ where: { reference } })).status).toBe("ACTIVE");
  });

  it("does not credit a charge whose amount or recipient differs from the record", async () => {
    const s = await setup();
    const reference = await startMonthly(s);
    await deliver(await getSimulator().activateSubscription(reference));
    const rec = await db.recurringDonation.findUniqueOrThrow({ where: { reference } });
    const sub = { id: rec.providerSubscriptionId!, reference, amount: rec.amount, currency: "NGN", accountId: s.accountId, interval: "MONTHLY" as const, status: "active" as const, charges: 1 };
    const forged = getSimulator().buildWebhook({ type: "recurring.charge_succeeded", subscription: { ...sub, accountId: "sim_acct_attacker" }, charge: { id: "sim_in_forged", amount: 1, currency: "NGN", paidAt: new Date().toISOString() } });
    expect(await deliver(forged)).toEqual(["mismatch"]);
    const charges = await db.donation.findMany({ where: { recurringDonationId: rec.id, status: "SUCCEEDED" } });
    expect(charges).toHaveLength(1);
  });

  it("can be cancelled by the donor or by finance, never by someone else", async () => {
    const s = await setup();
    const reference = await startMonthly(s);
    await deliver(await getSimulator().activateSubscription(reference));
    const rec = await db.recurringDonation.findUniqueOrThrow({ where: { reference } });
    const stranger = await createUser();
    await expect(cancelMyRecurringDonation(stranger.id, rec.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(cancelRecurringForOrganisation(await ctxFor(s.donor, s.org), rec.id)).rejects.toBeInstanceOf(ForbiddenError);
    await cancelMyRecurringDonation(s.donor.id, rec.id);
    const after = await db.recurringDonation.findUniqueOrThrow({ where: { id: rec.id } });
    expect(after).toMatchObject({ status: "CANCELED", canceledBy: "donor" });
    const providerSide = await db.simulatorRecord.findUniqueOrThrow({ where: { key: `subscription:${rec.providerSubscriptionId}` } });
    expect((providerSide.data as { status: string }).status).toBe("canceled");
  });

  it("follows provider-side cancellation", async () => {
    const s = await setup();
    const reference = await startMonthly(s);
    await deliver(await getSimulator().activateSubscription(reference));
    const rec = await db.recurringDonation.findUniqueOrThrow({ where: { reference } });
    await deliver(await getSimulator().cancelAtProvider(rec.providerSubscriptionId!));
    expect((await db.recurringDonation.findUniqueOrThrow({ where: { reference } })).canceledBy).toBe("provider");
  });
});

describe("payout import", () => {
  it("imports provider payouts idempotently and reports paid-out totals", async () => {
    const s = await setup();
    const one = await startDonation(null, s.org.slug, s.campaign.id, { amount: "5000", donorEmail: "g@x.test" }, meta);
    const { createCheckout } = await import("@/server/payments/donations");
    await createCheckout(one.reference);
    await deliver(await getSimulator().completeCheckout(one.reference, "succeeded"));

    const paid = await getSimulator().createPayout(s.accountId, 400000, "NGN", "paid");
    const transit = await getSimulator().createPayout(s.accountId, 50000, "NGN", "pending");
    await expect(importSettlements(await ctxFor(s.donor, s.org))).rejects.toBeInstanceOf(ForbiddenError);
    expect(await importSettlements(s.fctx)).toEqual({ created: 2, updated: 0 });
    expect(await importSettlements(s.fctx)).toEqual({ created: 0, updated: 0 });

    let summary = (await financeSummary(s.fctx)).currencies[0]!;
    expect(summary).toMatchObject({ settled: 400000, inTransit: 50000 });

    await deliver(await getSimulator().setPayoutStatus(transit.providerSettlementId, "paid"));
    summary = (await financeSummary(s.fctx)).currencies[0]!;
    expect(summary).toMatchObject({ settled: 450000, inTransit: 0 });
    expect(await db.settlementRecord.count({ where: { organizationId: s.org.id } })).toBe(2);
    expect(paid.providerSettlementId).toBeTruthy();
  });

  it("refuses to move a payout between organisations", async () => {
    const a = await setup();
    const b = await setup();
    const p = await getSimulator().createPayout(a.accountId, 1000, "NGN", "paid");
    await importSettlements(a.fctx);
    const connB = await db.paymentProviderConnection.findFirstOrThrow({ where: { organizationId: b.org.id } });
    expect(await applySettlement(connB, { ...p, expectedAt: null, settledAt: null })).toBe("mismatch");
    expect((await db.settlementRecord.findFirstOrThrow({ where: { providerSettlementId: p.providerSettlementId } })).organizationId).toBe(a.org.id);
  });
});
