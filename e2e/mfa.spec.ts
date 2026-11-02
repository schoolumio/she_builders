import { expect, test } from "@playwright/test";
import { stepAt, totpAt } from "../src/server/auth/totp";
import { PASSWORD, register } from "./helpers";

test("members can turn on two-factor and must use it to sign in", async ({ page }) => {
  const email = `mfa-${Date.now().toString(36)}@e2e.test`;
  await register(page, "Tola Twofactor", email);
  await page.goto("/app/security");
  await page.getByRole("button", { name: "Set up two-factor authentication" }).click();
  const key = (await page.locator("code").first().innerText()).replace(/\s/g, "");
  expect(key).toMatch(/^[A-Z2-7]{32}$/);
  await page.getByLabel("Code from the app").fill(totpAt(key, stepAt(Date.now())));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("Save these recovery codes now")).toBeVisible();

  // Sign out, then sign back in: the password alone is not enough.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login\/two-factor/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/); // no session yet

  await page.goto("/login/two-factor");
  await page.getByLabel("Verification code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("That code isn't right.")).toBeVisible();
  // A fresh code (next time step, so replay protection does not reject it).
  await page.getByLabel("Verification code").fill(totpAt(key, stepAt(Date.now()) + 1));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
});
