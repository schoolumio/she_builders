import { randomBytes, scryptSync } from "node:crypto";
import { expect, test } from "@playwright/test";
import { db, login, PASSWORD } from "./helpers";

/** Recurring giving and payout import through the UI, using the payment simulator. */
function hash(password: string) {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, 32, { N: 32768, r: 8, p: 3, maxmem: 128 * 32768 * 8 * 2 });
  return `scrypt$32768$8$3$${salt.toString("base64")}$${key.toString("base64")}`;
}

const run = Date.now().toString(36);
const slug = `rec-${run}`;
const donorEmail = `donor-${run}@e2e.test`;
const financeEmail = `fin-${run}@e2e.test`;
let campaignId = "";

test.beforeAll(async () => {
  const mk = (email: string, name: string) => db.user.create({ data: { email, name, passwordHash: hash(PASSWORD), emailVerifiedAt: new Date() } });
  const finance = await mk(financeEmail, "Fola Finance");
  const donor = await mk(donorEmail, "Dami Donor");
  const plan = await db.plan.findUniqueOrThrow({ where: { code: "MINISTRY" } });
  const org = await db.organization.create({
    data: { slug, name: "Recurring Prayer Circle", country: "NG", timezone: "Africa/Lagos", termsAcceptedAt: new Date(), termsAcceptedById: finance.id, fundraisingEnabled: true },
  });
  await db.membership.createMany({
    data: [
      { organizationId: org.id, userId: finance.id, roles: ["OWNER", "FINANCE_ADMIN", "MEMBER"], status: "ACTIVE" },
      { organizationId: org.id, userId: donor.id, roles: ["MEMBER"], status: "ACTIVE" },
    ],
  });
  await db.subscription.create({ data: { organizationId: org.id, planId: plan.id, status: "ACTIVE", currentPeriodStart: new Date() } });
  const accountId = `sim_acct_${run}`;
  await db.simulatorRecord.create({ data: { key: `account:${accountId}`, data: { status: "verified", country: "NG", currencies: ["NGN"] } } });
  await db.paymentProviderConnection.create({
    data: { organizationId: org.id, provider: "SIMULATOR", status: "VERIFIED", providerAccountId: accountId, chargesEnabled: true, payoutsEnabled: true, providerApproved: true, createdById: finance.id },
  });
  const c = await db.fundraisingCampaign.create({
    data: { organizationId: org.id, title: "Monthly partners", description: "Partner with us monthly.", currency: "NGN", suggestedAmounts: [200000], allowRecurring: true, status: "ACTIVE", createdById: finance.id },
  });
  campaignId = c.id;
});

test("a member sets up a monthly gift, is charged again, sees it in My giving, and cancels", async ({ page, browser }) => {
  await login(page, donorEmail);
  await page.goto(`/c/${slug}/give/${campaignId}`);
  await page.getByLabel("Monthly").check();
  await page.getByRole("button", { name: "Review donation" }).click();
  await expect(page.getByRole("heading", { name: "Review your monthly gift" })).toBeVisible();
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await expect(page).toHaveURL(/\/simulator\/subscribe\//);
  await page.getByRole("button", { name: /Start subscription/ }).click();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await expect(page.getByText("Payments", { exact: true })).toBeVisible();

  // The provider charges the next month.
  await page.goto("/simulator");
  await page.getByRole("button", { name: "Charge next period" }).first().click(); // newest subscription is listed first
  await expect(page.getByText(/2 charges/)).toBeVisible();
  await page.goto("/app/donations");
  await expect(page.getByText(/2 payments made/)).toBeVisible();

  // Finance sees the recurring gift.
  const fin = await (await browser.newContext()).newPage();
  await login(fin, financeEmail);
  await fin.goto(`/o/${slug}/finance/recurring`);
  await expect(fin.getByText("Dami Donor")).toBeVisible();
  await fin.context().close();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("canceled", { exact: true })).toBeVisible();
});

test("finance imports provider payouts and sees paid-out totals", async ({ page }) => {
  await login(page, financeEmail);
  await page.goto("/simulator");
  await page.getByRole("listitem").filter({ hasText: "Recurring Prayer Circle" }).getByRole("button", { name: "Create payout (paid)" }).click();
  await page.goto(`/o/${slug}/finance/payouts`);
  await expect(page.getByText("No payouts imported yet")).toBeVisible();
  await page.getByRole("button", { name: /Import from/ }).click();
  await expect(page.getByText(/Imported from the provider: 1 new/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "paid" })).toBeVisible();
  await page.goto(`/o/${slug}/finance`);
  await expect(page.getByText("Paid out to your bank")).toBeVisible();
});
