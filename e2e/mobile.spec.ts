import { expect, test } from "@playwright/test";

/** Elements wider than the viewport, including ones hidden by an overflow-hidden ancestor. */
async function clippedElements(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("main h1, main h2, main p, main a, header a")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > window.innerWidth + 1;
      })
      .map((el) => `${el.tagName}: ${(el.textContent ?? "").trim().slice(0, 40)}`),
  );
}

test("public site and sign-in work on a phone-sized screen", async ({ page }) => {
  for (const path of ["/", "/pricing", "/support?topic=demo"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    expect(await clippedElements(page), path).toEqual([]);
  }
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
  const box = await page.getByRole("button", { name: "Sign in" }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(40);
});

test("signed-out visitors are sent to sign in from protected pages", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp/);
});
