import { beforeEach, describe, expect, it } from "vitest";
import type { Organization, User } from "@prisma/client";
import { db, resetDb } from "../support/db";
import { addMember, createOrg, createUser, ctxFor } from "../support/factories";
import { donationReadiness, refreshConnection, setFundraisingEnabled, startOnboarding, disconnect } from "@/server/payments/connections";
import { createCampaign, decideCampaign } from "@/server/payments/campaigns";
import { createCheckout, financeSummary, getDonationByReference, getDonationForFinance, listDonations, requestRefund, startDonation, exportDonationsCsv } from "@/server/payments/donations";
import { processPaymentEvent, reconcileDonation } from "@/server/payments/events";
import { getSimulator } from "@/server/payments/providers";
import { SIMULATOR_SIGNATURE_HEADER } from "@/server/payments/providers/simulator";
import { WebhookSignatureError } from "@/server/payments/types";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

beforeEach(resetDb);
const meta = { ipHash: "test-ip" };

async function verifiedOrg() {
  const owner = await createUser();
  const org = await createOrg(owner);
  const finance = await addMember(org, ["FINANCE_ADMIN"]);
  const member = await addMember(org);
  const fctx = await ctxFor(finance, org);
  const { connection } = await startOnboarding(fctx, "SIMULATOR", {});
  await getSimulator().setAccountStatus(connection.providerAccountId!, "verified");
  await refreshConnection(fctx, connection.id);
  await setFundraisingEnabled(fctx, true);
  const campaign = await createCampaign(fctx, {
    title: "Outreach 2026",
    description: "Supporting our community outreach programme.",
    purpose: "OUTREACH",
    currency: "NGN",
    suggestedAmounts: "1000, 5000",
    minAmount: "500",
    maxAmount: "1000000",
    allowCustomAmount: "on",
    allowAnonymous: "on",
    allowGuests: "on",
    visibility: "PUBLIC",
  });
  await decideCampaign(fctx, campaign.id, "approve");
  return { owner, org, finance, member, fctx, campaign, connectionId: connection.id };
}

async function deliver(raw: string, signature: string) {
  const ev = await getSimulator().parseWebhook(raw, new Headers({ [SIMULATOR_SIGNATURE_HEADER]: signature }));
  return processPaymentEvent("SIMULATOR", ev);
}

async function payAndConfirm(org: Organization, campaignId: string, donor: User | null, amount = "5000") {
  const { reference } = await startDonation(donor ? { ...donor } : null, org.slug, campaignId, { amount, donorEmail: donor ? undefined : "guest@example.test" }, meta);
  await createCheckout(reference, donor?.id);
  const { raw, signature } = await getSimulator().completeCheckout(reference, "succeeded");
  const outcome = await deliver(raw, signature);
  return { reference, raw, signature, outcome };
}

describe("payment account onboarding", () => {
  it("blocks donations until the provider verifies the account", async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    const ctx = await ctxFor(owner, org);
    expect((await donationReadiness(org.id, "NGN")).ready).toBe(false);
    const { connection, redirectUrl } = await startOnboarding(ctx, "SIMULATOR", {});
    expect(connection.status).toBe("ONBOARDING_REQUIRED");
    expect(redirectUrl).toContain("/simulator/onboarding/");
    await setFundraisingEnabled(ctx, true);
    expect((await donationReadiness(org.id, "NGN")).ready).toBe(false);

    await getSimulator().setAccountStatus(connection.providerAccountId!, "pending");
    expect((await refreshConnection(ctx, connection.id))!.status).toBe("PENDING_VERIFICATION");
    expect((await donationReadiness(org.id, "NGN")).ready).toBe(false);

    await getSimulator().setAccountStatus(connection.providerAccountId!, "verified");
    expect((await refreshConnection(ctx, connection.id))!.status).toBe("VERIFIED");
    expect((await donationReadiness(org.id, "NGN")).ready).toBe(true);

    await getSimulator().setAccountStatus(connection.providerAccountId!, "restricted");
    expect((await refreshConnection(ctx, connection.id))!.status).toBe("RESTRICTED");
    expect((await donationReadiness(org.id, "NGN")).ready).toBe(false);
  });

  it("refuses providers without configuration and users without finance permission", async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    const admin = await addMember(org, ["ADMIN"]);
    await expect(startOnboarding(await ctxFor(owner, org), "STRIPE", {})).rejects.toBeInstanceOf(ValidationError);
    await expect(startOnboarding(await ctxFor(admin, org), "SIMULATOR", {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("requires the fundraising entitlement", async () => {
    const owner = await createUser();
    const org = await createOrg(owner, { plan: "GROWTH" });
    await expect(startOnboarding(await ctxFor(owner, org), "SIMULATOR", {})).rejects.toBeTruthy();
    expect((await donationReadiness(org.id, "NGN")).ready).toBe(false);
  });
});

describe("donation checkout", () => {
  it("derives organisation, currency and recipient on the server, ignoring tampered fields", async () => {
    const s = await verifiedOrg();
    const other = await verifiedOrg();
    const { reference } = await startDonation(null, s.org.slug, s.campaign.id, {
      amount: "2500",
      donorEmail: "guest@example.test",
      currency: "USD",
      organizationId: other.org.id,
      connectionId: other.connectionId,
      platformFeeAmount: "0",
    }, meta);
    const d = await db.donation.findUniqueOrThrow({ where: { reference } });
    expect(d.organizationId).toBe(s.org.id);
    expect(d.currency).toBe("NGN");
    expect(d.connectionId).toBe(s.connectionId);
    expect(d.amount).toBe(250000);
    expect(d.status).toBe("PENDING");
  });

  it("rejects amounts outside the campaign limits and non-suggested amounts when custom is off", async () => {
    const s = await verifiedOrg();
    await expect(startDonation(null, s.org.slug, s.campaign.id, { amount: "10", donorEmail: "g@example.test" }, meta)).rejects.toBeInstanceOf(ValidationError);
    await expect(startDonation(null, s.org.slug, s.campaign.id, { amount: "-5", donorEmail: "g@example.test" }, meta)).rejects.toBeInstanceOf(ValidationError);
    await db.fundraisingCampaign.update({ where: { id: s.campaign.id }, data: { allowCustomAmount: false } });
    await expect(startDonation(null, s.org.slug, s.campaign.id, { amount: "1234", donorEmail: "g@example.test" }, meta)).rejects.toBeInstanceOf(ValidationError);
    await expect(startDonation(null, s.org.slug, s.campaign.id, { amount: "1000", donorEmail: "g@example.test" }, meta)).resolves.toBeTruthy();
  });

  it("does not accept donations for draft campaigns or members-only campaigns from guests", async () => {
    const s = await verifiedOrg();
    const draft = await createCampaign(s.fctx, { title: "Draft", description: "Draft campaign description", purpose: "GENERAL", currency: "NGN", allowCustomAmount: "on", visibility: "MEMBERS" });
    await expect(startDonation(null, s.org.slug, draft.id, { amount: "1000", donorEmail: "g@example.test" }, meta)).rejects.toBeInstanceOf(NotFoundError);
    await decideCampaign(s.fctx, draft.id, "approve");
    await expect(startDonation(null, s.org.slug, draft.id, { amount: "1000", donorEmail: "g@example.test" }, meta)).rejects.toBeInstanceOf(NotFoundError);
    await expect(startDonation(s.member, s.org.slug, draft.id, { amount: "1000" }, meta)).resolves.toBeTruthy();
  });

  it("blocks checkout if the account becomes restricted after the donation started", async () => {
    const s = await verifiedOrg();
    const { reference } = await startDonation(null, s.org.slug, s.campaign.id, { amount: "1000", donorEmail: "g@example.test" }, meta);
    const conn = await db.paymentProviderConnection.findUniqueOrThrow({ where: { id: s.connectionId } });
    await getSimulator().setAccountStatus(conn.providerAccountId!, "restricted");
    await refreshConnection(s.fctx, s.connectionId);
    await expect(createCheckout(reference)).rejects.toBeInstanceOf(AppError);
  });
});

describe("payment confirmation", () => {
  it("a browser return alone never confirms the payment", async () => {
    const s = await verifiedOrg();
    const { reference } = await startDonation(null, s.org.slug, s.campaign.id, { amount: "5000", donorEmail: "g@example.test" }, meta);
    await createCheckout(reference);
    // The donor lands on the result page without any provider confirmation.
    expect((await getDonationByReference(reference)).status).toBe("PENDING");
    expect(await reconcileDonation(reference)).toBe("no_op"); // provider still says pending
    expect((await getDonationByReference(reference)).status).toBe("PENDING");
  });

  it("server-side verification confirms a payment the provider reports as paid", async () => {
    const s = await verifiedOrg();
    const { reference } = await startDonation(null, s.org.slug, s.campaign.id, { amount: "5000", donorEmail: "g@example.test" }, meta);
    await createCheckout(reference);
    await getSimulator().completeCheckout(reference, "succeeded"); // webhook not delivered
    expect(await reconcileDonation(reference)).toBe("processed");
    expect((await getDonationByReference(reference)).status).toBe("SUCCEEDED");
  });

  it("verified webhooks credit the correct organisation with a full ledger and receipt", async () => {
    const s = await verifiedOrg();
    const { reference, outcome } = await payAndConfirm(s.org, s.campaign.id, null);
    expect(outcome).toBe("processed");
    const d = await db.donation.findUniqueOrThrow({ where: { reference }, include: { ledgerEntries: true } });
    expect(d.status).toBe("SUCCEEDED");
    expect(d.organizationId).toBe(s.org.id);
    expect(d.receiptNumber).toMatch(/^R-\d{8}-/);
    expect(d.processingFeeAmount).toBe(Math.round(500000 * 0.015));
    expect(d.netAmount).toBe(500000 - d.processingFeeAmount! - d.platformFeeAmount);
    expect(d.ledgerEntries.map((l) => l.type).sort()).toEqual(["CHARGE", "PROCESSING_FEE"]);
    expect(d.receiptSentAt).not.toBeNull();
    expect(await db.emailOutbox.count({ where: { to: "guest@example.test", category: "FUNDRAISING" } })).toBe(1);
  });

  it("rejects invalid webhook signatures", async () => {
    const s = await verifiedOrg();
    const { reference } = await startDonation(null, s.org.slug, s.campaign.id, { amount: "5000", donorEmail: "g@example.test" }, meta);
    await createCheckout(reference);
    const { raw } = await getSimulator().completeCheckout(reference, "succeeded");
    await expect(getSimulator().parseWebhook(raw, new Headers({ [SIMULATOR_SIGNATURE_HEADER]: "0".repeat(64) }))).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(getSimulator().parseWebhook(raw, new Headers())).rejects.toBeInstanceOf(WebhookSignatureError);
    expect((await getDonationByReference(reference)).status).toBe("PENDING");
  });

  it("duplicate webhooks do not create duplicate records", async () => {
    const s = await verifiedOrg();
    const { reference, raw, signature } = await payAndConfirm(s.org, s.campaign.id, null);
    expect(await deliver(raw, signature)).toBe("duplicate");
    // A different event id for the same payment (e.g. provider retry with new id) is a no-op.
    const again = getSimulator().buildWebhook({ type: "payment.succeeded", payment: JSON.parse(raw).payment });
    expect(await deliver(again.raw, again.signature)).toBe("no_op");
    const d = await db.donation.findUniqueOrThrow({ where: { reference }, include: { ledgerEntries: true } });
    expect(d.ledgerEntries.filter((l) => l.type === "CHARGE")).toHaveLength(1);
    expect(await db.donation.count()).toBe(1);
    expect(await db.emailOutbox.count({ where: { category: "FUNDRAISING" } })).toBe(1);
  });

  it("does not credit a payment whose amount, currency or recipient differ from the server record", async () => {
    for (const field of ["amount", "currency", "accountId"] as const) {
      await resetDb();
      const s = await verifiedOrg();
      const { reference } = await startDonation(null, s.org.slug, s.campaign.id, { amount: "5000", donorEmail: "g@example.test" }, meta);
      await createCheckout(reference);
      const { raw } = await getSimulator().completeCheckout(reference, "succeeded");
      // Simulate the provider reporting a different payment than we created.
      const rec = await db.simulatorRecord.findUniqueOrThrow({ where: { key: `payment:${reference}` } });
      const data = { ...(rec.data as Record<string, unknown>), ...(field === "amount" ? { amount: 100 } : field === "currency" ? { currency: "USD" } : { accountId: "sim_acct_attacker" }) };
      await db.simulatorRecord.update({ where: { key: rec.key }, data: { data } });
      const forged = getSimulator().buildWebhook({ type: "payment.succeeded", payment: { ...JSON.parse(raw).payment, ...data } });
      expect(await deliver(forged.raw, forged.signature)).toBe("mismatch");
      const d = await db.donation.findUniqueOrThrow({ where: { reference } });
      expect(d.status).toBe("PENDING");
      expect(d.failureReason).toContain("mismatch");
      expect(await db.ledgerEntry.count()).toBe(0);
    }
  });

  it("represents failed and pending payments correctly", async () => {
    const s = await verifiedOrg();
    const a = await startDonation(null, s.org.slug, s.campaign.id, { amount: "5000", donorEmail: "g@example.test" }, meta);
    await createCheckout(a.reference);
    const failed = await getSimulator().completeCheckout(a.reference, "failed");
    expect(await deliver(failed.raw, failed.signature)).toBe("processed");
    expect((await getDonationByReference(a.reference)).status).toBe("FAILED");

    const b = await startDonation(null, s.org.slug, s.campaign.id, { amount: "5000", donorEmail: "g@example.test" }, meta);
    await createCheckout(b.reference);
    const pending = await getSimulator().completeCheckout(b.reference, "pending");
    expect(await deliver(pending.raw, pending.signature)).toBe("no_op");
    expect((await getDonationByReference(b.reference)).status).toBe("PENDING");
    expect(await db.ledgerEntry.count()).toBe(0);
  });
});

describe("refunds", () => {
  it("finance admins refund; records and ledger update; over-refunds are refused", async () => {
    const s = await verifiedOrg();
    const { reference } = await payAndConfirm(s.org, s.campaign.id, null);
    const d = await db.donation.findUniqueOrThrow({ where: { reference } });
    await expect(requestRefund(await ctxFor(s.member, s.org), d.id, { amount: "1000" })).rejects.toBeInstanceOf(ForbiddenError);
    await requestRefund(s.fctx, d.id, { amount: "1000", reason: "Donor request" });
    let after = await getDonationForFinance(s.fctx, d.id);
    expect(after.status).toBe("PARTIALLY_REFUNDED");
    expect(after.amountRefunded).toBe(100000);
    expect(after.refunds[0]!.status).toBe("SUCCEEDED");
    expect(after.ledgerEntries.find((l) => l.type === "REFUND")?.amount).toBe(-100000);
    await expect(requestRefund(s.fctx, d.id, { amount: "4500" })).rejects.toBeInstanceOf(ValidationError);
    await requestRefund(s.fctx, d.id, { amount: "4000" });
    after = await getDonationForFinance(s.fctx, d.id);
    expect(after.status).toBe("REFUNDED");
  });
});

describe("financial reports", () => {
  it("are visible only to finance roles and only for their own organisation", async () => {
    const s = await verifiedOrg();
    const other = await verifiedOrg();
    const { reference } = await payAndConfirm(s.org, s.campaign.id, s.member);
    const d = await db.donation.findUniqueOrThrow({ where: { reference } });
    await expect(financeSummary(await ctxFor(s.member, s.org))).rejects.toBeInstanceOf(ForbiddenError);
    const admin = await addMember(s.org, ["ADMIN"]);
    await expect(listDonations(await ctxFor(admin, s.org))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getDonationForFinance(other.fctx, d.id)).rejects.toBeInstanceOf(NotFoundError);
    const summary = await financeSummary(s.fctx);
    expect(summary.currencies[0]).toMatchObject({ currency: "NGN", gross: 500000 });
    const csv = await exportDonationsCsv(s.fctx);
    expect(csv.split("\n")[1]).toContain(reference);
    expect(await getDonationByReference(reference, s.member.id)).toBeTruthy();
    await expect(getDonationByReference(reference, other.finance.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps donations separate from BridgeCodes subscription revenue and from paid gifts", async () => {
    const s = await verifiedOrg();
    await payAndConfirm(s.org, s.campaign.id, null);
    expect(await db.subscriptionInvoice.count()).toBe(0);
    const ledgerOrgs = await db.ledgerEntry.findMany({ select: { organizationId: true } });
    expect(new Set(ledgerOrgs.map((l) => l.organizationId))).toEqual(new Set([s.org.id]));
    await db.donation.create({
      data: { organizationId: s.org.id, connectionId: s.connectionId, provider: "SIMULATOR", purpose: "GIFT", reference: "gift_test_reference_1", currency: "NGN", amount: 1000, status: "SUCCEEDED" },
    });
    expect((await listDonations(s.fctx)).every((d) => d.purpose === "DONATION")).toBe(true);
  });

  it("neutralises spreadsheet formulas in CSV exports", async () => {
    const s = await verifiedOrg();
    const { reference } = await startDonation(null, s.org.slug, s.campaign.id, { amount: "5000", donorEmail: "g@example.test", donorName: "=HYPERLINK(\"http://evil\")" }, meta);
    expect(reference).toBeTruthy();
    const csv = await exportDonationsCsv(s.fctx);
    expect(csv).toContain("'=HYPERLINK");
  });
});

describe("disconnection", () => {
  it("stops donations once disconnected", async () => {
    const s = await verifiedOrg();
    await disconnect(s.fctx, s.connectionId);
    await expect(startDonation(null, s.org.slug, s.campaign.id, { amount: "1000", donorEmail: "g@example.test" }, meta)).rejects.toBeInstanceOf(AppError);
  });
});
