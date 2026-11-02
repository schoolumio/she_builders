import { createHash } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DB } from "./env";

export const db = new PrismaClient({ datasourceUrl: E2E_DB });
export const PASSWORD = "correct horse battery";

export async function register(page: Page, name: string, email: string, next?: string) {
  await page.goto(`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/register"));
}

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app/);
}

export async function newUserPage(browser: Browser) {
  const ctx = await browser.newContext();
  return ctx.newPage();
}

/** Invitation tokens are only ever emailed; tests set a known token on the stored hash. */
export async function setInvitationToken(email: string, token: string) {
  const inv = await db.invitation.findFirstOrThrow({ where: { email, acceptedAt: null, revokedAt: null }, orderBy: { createdAt: "desc" } });
  await db.invitation.update({ where: { id: inv.id }, data: { tokenHash: createHash("sha256").update(token).digest("hex") } });
}
