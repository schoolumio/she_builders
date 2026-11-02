import { randomBytes, scryptSync } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { db, login, PASSWORD } from "./helpers";

/** Automated WCAG 2.1 A/AA checks (axe-core) on the main public, member, admin and finance pages. */
function hash(password: string) {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, 32, { N: 32768, r: 8, p: 3, maxmem: 128 * 32768 * 8 * 2 });
  return `scrypt$32768$8$3$${salt.toString("base64")}$${key.toString("base64")}`;
}

const slug = `a11y-${Date.now().toString(36)}`;
const email = `a11y-${Date.now().toString(36)}@e2e.test`;

test.beforeAll(async () => {
  const user = await db.user.create({ data: { email, name: "Ada Accessible", passwordHash: hash(PASSWORD), emailVerifiedAt: new Date() } });
  const plan = await db.plan.findUniqueOrThrow({ where: { code: "MINISTRY" } });
  const org = await db.organization.create({
    data: { slug, name: "Accessible Prayer Circle", country: "NG", timezone: "Africa/Lagos", termsAcceptedAt: new Date(), termsAcceptedById: user.id, description: "Testing accessibility." },
  });
  await db.membership.create({ data: { organizationId: org.id, userId: user.id, roles: ["OWNER", "PRAYER_COORDINATOR", "MEMBER"], status: "ACTIVE", joinedAt: new Date() } });
  await db.subscription.create({ data: { organizationId: org.id, planId: plan.id, status: "ACTIVE", currentPeriodStart: new Date() } });
  await db.prayerPoint.create({ data: { organizationId: org.id, forDate: "2020-01-01", title: "Sample point", body: "Pray", status: "PUBLISHED", authorId: user.id } });
});

const PUBLIC = ["/", "/pricing", "/communities", "/login", "/register", "/privacy", "/support"];
const SIGNED_IN = ["/app", "/app/profile", "/app/security", "/app/notifications", `/c/${slug}`, `/o/${slug}`, `/o/${slug}/meetings`, `/o/${slug}/prayer/new`, `/o/${slug}/testimonies`, `/o/${slug}/admin`, `/o/${slug}/admin/settings`, `/o/${slug}/admin/members`, `/o/${slug}/admin/meetings/new`, `/o/${slug}/admin/content`, `/o/${slug}/admin/billing`, `/o/${slug}/finance/setup`, `/o/${slug}/finance/campaigns/new`];

async function scanAll(page: import("@playwright/test").Page, paths: string[]) {
  const problems: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const v of results.violations) problems.push(`${path} — ${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  }
  expect(problems, problems.join("\n")).toEqual([]);
}

test("public pages have no detectable WCAG A/AA violations", async ({ page }) => {
  await scanAll(page, PUBLIC);
});

test("signed-in pages have no detectable WCAG A/AA violations", async ({ page }) => {
  await login(page, email);
  await scanAll(page, SIGNED_IN);
});
