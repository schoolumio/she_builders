import { expect, test } from "@playwright/test";

test("public site and sign-in work on a phone-sized screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
  const box = await page.getByRole("button", { name: "Sign in" }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(40);
});

test("signed-out visitors are sent to sign in from protected pages", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp/);
});
