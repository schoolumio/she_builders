import { expect, test, type Page } from "@playwright/test";
import { db, login, newUserPage, register, setInvitationToken } from "./helpers";

/**
 * The initial-release acceptance workflow, end to end through the browser:
 * register an organisation → profile → invite → roles → group → meetings →
 * prayer points → confidential prayer requests → fundraising with a verified
 * (simulated) provider account → donation confirmed server-side → reports.
 */
test.describe.serial("acceptance workflow", () => {
  const run = Date.now().toString(36);
  const slug = `grace-${run}`;
  const owner = { name: "Ada Owner", email: `owner-${run}@e2e.test` };
  const member = { name: "Mary Member", email: `member-${run}@e2e.test` };
  const finance = { name: "Femi Finance", email: `finance-${run}@e2e.test` };
  const coordinator = { name: "Chika Coordinator", email: `coord-${run}@e2e.test` };
  let ownerPage: Page;
  let memberPage: Page;
  let prayerUrl = "";
  let campaignId = "";

  test("1–2. register an organisation and configure its profile", async ({ browser }) => {
    ownerPage = await newUserPage(browser);
    await register(ownerPage, owner.name, owner.email, "/orgs/new");
    await expect(ownerPage).toHaveURL(/\/orgs\/new/);
    await ownerPage.getByLabel("Community web address").fill(slug);
    await ownerPage.getByLabel("Community name").fill("Grace Prayer Circle");
    await ownerPage.getByLabel(/I accept the/).check();
    await ownerPage.getByRole("button", { name: "Create community" }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/o/${slug}/admin`));
    await expect(ownerPage.getByText("Your community is ready")).toBeVisible();

    await ownerPage.goto(`/o/${slug}/admin/settings`);
    await ownerPage.getByLabel("Tagline").fill("Praying together across time zones");
    await ownerPage.getByLabel("About").fill("An online women's prayer community.");
    await ownerPage.getByRole("button", { name: "Save profile" }).click();
    await expect(ownerPage.getByText("Community profile saved.")).toBeVisible();
    // Upload a logo (a real 1×1 PNG; content type is sniffed server-side).
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    await ownerPage.getByLabel("Logo", { exact: true }).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
    await ownerPage.getByRole("button", { name: "Upload" }).first().click();
    await expect(ownerPage.getByText("Logo updated.")).toBeVisible();
    await ownerPage.goto(`/c/${slug}`);
    await expect(ownerPage.getByText("Praying together across time zones")).toBeVisible();
    const logo = await db.organization.findUniqueOrThrow({ where: { slug } });
    expect(logo.logoUrl).toMatch(/^\/api\/files\/orgs\/.+\.png$/);
    expect((await ownerPage.request.get(logo.logoUrl!)).headers()["content-type"]).toBe("image/png");

    // Platform admin assigns the Ministry plan manually (online billing is not configured in e2e).
    const org = await db.organization.findUniqueOrThrow({ where: { slug } });
    const plan = await db.plan.findUniqueOrThrow({ where: { code: "MINISTRY" } });
    await db.subscription.update({ where: { organizationId: org.id }, data: { planId: plan.id } });
  });

  test("3. invite members, who accept with single-use links", async ({ browser }) => {
    await ownerPage.goto(`/o/${slug}/admin/invitations`);
    await ownerPage.getByLabel("Email addresses").fill([member.email, finance.email, coordinator.email].join(", "));
    await ownerPage.getByRole("button", { name: "Send invitations" }).click();
    await expect(ownerPage.getByText("3 invitations sent.")).toBeVisible();

    for (const person of [member, finance, coordinator]) {
      const token = `e2e-token-${person.email.replace(/[^a-z0-9]/gi, "-")}`;
      await setInvitationToken(person.email, token);
      const page = await newUserPage(browser);
      await page.goto(`/invite/${token}`);
      await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
      await register(page, person.name, person.email, `/invite/${token}`);
      await expect(page).toHaveURL(new RegExp(`/invite/${token}`));
      await page.getByRole("button", { name: "Accept invitation" }).click();
      await expect(page).toHaveURL(new RegExp(`/o/${slug}$`));
      if (person === member) memberPage = page;
      else await page.context().close();
    }
    // The link cannot be reused.
    await memberPage.goto(`/invite/e2e-token-${member.email.replace(/[^a-z0-9]/gi, "-")}`);
    await expect(memberPage.getByText("Invitation unavailable")).toBeVisible();
  });

  test("4. assign administrative roles", async () => {
    await ownerPage.goto(`/o/${slug}/admin/members`);
    for (const [person, role] of [[finance, "Finance administrator"], [coordinator, "Prayer coordinator"]] as const) {
      const card = ownerPage.locator("div").filter({ hasText: person.email }).filter({ has: ownerPage.getByText("Change roles") }).last();
      await card.getByText("Change roles").click();
      await card.getByLabel(role).check();
      await card.getByRole("button", { name: "Save roles" }).click();
      await expect(card.getByText("Roles updated.")).toBeVisible();
    }
    const fin = await db.user.findUniqueOrThrow({ where: { email: finance.email }, include: { memberships: true } });
    expect(fin.memberships[0]!.roles).toContain("FINANCE_ADMIN");
  });

  test("5. create a prayer group", async () => {
    await ownerPage.goto(`/o/${slug}/admin/groups`);
    await ownerPage.getByLabel("Name").fill("Morning Intercessors");
    await ownerPage.getByRole("button", { name: "Create group" }).click();
    await expect(ownerPage.getByText("Group saved.")).toBeVisible();
    await expect(ownerPage.getByText("Morning Intercessors", { exact: true })).toBeVisible();
  });

  test("6–7. schedule a recurring prayer meeting with a WhatsApp link", async () => {
    await ownerPage.goto(`/o/${slug}/admin/meetings/new`);
    await ownerPage.getByLabel("Title").fill("Night watch prayer");
    await ownerPage.getByRole("textbox", { name: "WhatsApp link" }).fill("https://chat.whatsapp.com/E2EInviteCode");
    await ownerPage.getByLabel("Repeats").selectOption("WEEKLY");
    for (const d of ["Mon", "Wed", "Fri"]) await ownerPage.getByLabel(d, { exact: true }).check();
    await ownerPage.getByRole("button", { name: "Create meeting" }).click();
    await expect(ownerPage.getByText("Meeting created.")).toBeVisible();
    const meeting = await db.meeting.findFirstOrThrow({ where: { title: "Night watch prayer" }, include: { _count: { select: { occurrences: true } } } });
    expect(meeting.byWeekday).toEqual([1, 3, 5]);
    expect(meeting._count.occurrences).toBeGreaterThan(30);

    await memberPage.goto(`/o/${slug}/meetings`);
    await memberPage.getByRole("link", { name: /Night watch prayer/ }).first().click();
    await memberPage.getByRole("link", { name: "Join on WhatsApp" }).click();
    await expect(memberPage.getByText(/You.re about to leave/)).toBeVisible();
    await expect(memberPage.getByText(/group invite link/)).toBeVisible();
  });

  test("8–10. create in-app audio and video meetings for invited members", async () => {
    for (const mode of ["In-app audio", "In-app video"]) {
      await ownerPage.goto(`/o/${slug}/admin/meetings/new`);
      await ownerPage.getByLabel("Title").fill(`${mode} prayer`);
      await ownerPage.getByLabel("Date").fill(new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10));
      await ownerPage.getByRole("radio", { name: new RegExp(mode) }).check();
      await ownerPage.getByLabel("Who can see and join").selectOption("INVITED");
      await ownerPage.getByLabel(`Invite ${member.name}`).check();
      await ownerPage.getByRole("button", { name: "Create meeting" }).click();
      await expect(ownerPage.getByText("Meeting created.")).toBeVisible();
    }
    // The invited member sees them; the uninvited finance admin does not.
    await memberPage.goto(`/o/${slug}/meetings`);
    await expect(memberPage.getByText("In-app audio prayer").first()).toBeVisible();
    const finPage = await newUserPage(memberPage.context().browser()!);
    await login(finPage, finance.email);
    await finPage.goto(`/o/${slug}/meetings`);
    await expect(finPage.getByText("In-app video prayer")).toHaveCount(0);
    await finPage.context().close();
  });

  test("11. publish prayer points", async () => {
    await ownerPage.goto(`/o/${slug}/admin/content`);
    const form = ownerPage.locator("form").filter({ has: ownerPage.getByLabel("Prayer focus") }).first();
    await form.getByLabel("Title").fill("Pray for families");
    await form.getByLabel("Prayer focus").fill("Pray for peace in our homes.");
    await form.getByLabel("Scripture references").fill("Philippians 4:6-7");
    await form.getByLabel("Publish").check();
    await form.getByRole("button", { name: "Save" }).click();
    await expect(ownerPage.getByText("Prayer point published.")).toBeVisible();
    await memberPage.goto(`/o/${slug}`);
    await expect(memberPage.getByText("Pray for families")).toBeVisible();
  });

  test("12–13. confidential prayer requests stay private", async ({ browser }) => {
    await memberPage.goto(`/o/${slug}/prayer/new`);
    await memberPage.getByLabel("Title").fill("Healing for my mother");
    await memberPage.getByLabel("Your request").fill("She has surgery on Friday.");
    await expect(memberPage.getByText(/Who will see it:.*prayer coordinators/)).toBeVisible();
    await memberPage.getByLabel(/I understand who will be able to see/).check();
    await memberPage.getByRole("button", { name: "Share request" }).click();
    await expect(memberPage.getByText("Your request has been shared.")).toBeVisible();
    prayerUrl = new URL(memberPage.url()).pathname;

    // The owner and the finance administrator cannot open it.
    await ownerPage.goto(prayerUrl);
    await expect(ownerPage.getByText("We couldn't find that page")).toBeVisible();
    const finPage = await newUserPage(browser);
    await login(finPage, finance.email);
    await finPage.goto(prayerUrl);
    await expect(finPage.getByText("We couldn't find that page")).toBeVisible();
    await finPage.context().close();
    // The prayer coordinator can.
    const coordPage = await newUserPage(browser);
    await login(coordPage, coordinator.email);
    await coordPage.goto(`/o/${slug}/admin/prayer`);
    await expect(coordPage.getByText("Healing for my mother")).toBeVisible();
    await coordPage.context().close();
  });

  test("14–16. connect a payment account and block donations until verified", async ({ browser }) => {
    const fin = await newUserPage(browser);
    await login(fin, finance.email);
    await fin.goto(`/o/${slug}/finance/campaigns/new`);
    await fin.getByLabel("Campaign title").fill("Outreach 2026");
    await fin.getByLabel("Description").fill("Supporting our community outreach programme.");
    await fin.getByRole("button", { name: "Save draft" }).click();
    await fin.waitForURL((u) => /\/finance\/campaigns\/c[a-z0-9]{20,}$/.test(u.pathname));
    campaignId = fin.url().split("/").pop()!;
    await fin.getByRole("button", { name: "Approve & publish" }).click();
    await expect(fin.getByText("Published, but donations are blocked")).toBeVisible();

    // Guests cannot give yet.
    const guest = await newUserPage(browser);
    await guest.goto(`/c/${slug}/give/${campaignId}`);
    await expect(guest.getByText("Donations are not available yet")).toBeVisible();

    await fin.goto(`/o/${slug}/finance/setup`);
    await fin.getByRole("button", { name: "Turn fundraising on" }).click();
    await fin.getByRole("button", { name: /Connect with Payment simulator/ }).click();
    await expect(fin).toHaveURL(/\/simulator\/onboarding\//);
    await fin.getByRole("button", { name: "Submit — pending review" }).click();
    await expect(fin.getByText("Pending verification").first()).toBeVisible();
    await guest.reload();
    await expect(guest.getByText("Donations are not available yet")).toBeVisible();

    await fin.getByRole("button", { name: "Continue onboarding" }).click();
    await fin.getByRole("button", { name: "Approve (verified)" }).click();
    await expect(fin.getByText("Yes — donations can be accepted")).toBeVisible();
    await fin.context().close();
    await guest.context().close();
  });

  test("17–22. a test donation is verified server-side, recorded once, with a receipt", async ({ browser }) => {
    const guest = await newUserPage(browser);
    await guest.goto(`/c/${slug}/give/${campaignId}`);
    await guest.getByRole("button", { name: /5,000/ }).click();
    await guest.getByLabel("Email for your receipt").fill(`donor-${run}@e2e.test`);
    await guest.getByRole("button", { name: "Review donation" }).click();
    await expect(guest.getByText("Review your donation")).toBeVisible();
    await expect(guest.getByText("Grace Prayer Circle").first()).toBeVisible();
    await guest.getByRole("button", { name: "Continue to secure payment" }).click();
    await expect(guest).toHaveURL(/\/simulator\/checkout\//);
    // Do not deliver the webhook: the return page must verify with the provider itself.
    await guest.getByLabel(/Deliver signed webhook/).uncheck();
    await guest.getByRole("button", { name: "Pay successfully" }).click();
    await expect(guest.getByText("Thank you!")).toBeVisible();
    await expect(guest.getByText(/^R-\d{8}-/)).toBeVisible();

    const org = await db.organization.findUniqueOrThrow({ where: { slug } });
    const donations = await db.donation.findMany({ where: { organizationId: org.id }, include: { ledgerEntries: true } });
    expect(donations).toHaveLength(1);
    expect(donations[0]!.status).toBe("SUCCEEDED");
    expect(donations[0]!.ledgerEntries.filter((l) => l.type === "CHARGE")).toHaveLength(1);
    // Reloading the result page does not create duplicates.
    await guest.reload();
    expect(await db.ledgerEntry.count({ where: { organizationId: org.id, type: "CHARGE" } })).toBe(1);
    await guest.context().close();
  });

  test("23–25. finance reports are restricted and separate from subscription billing", async ({ browser }) => {
    const fin = await newUserPage(browser);
    await login(fin, finance.email);
    await fin.goto(`/o/${slug}/finance/donations`);
    await expect(fin.getByRole("cell", { name: /50,?00/ }).or(fin.getByText(/₦5,000|NGN\s?5,000/)).first()).toBeVisible();
    await fin.context().close();

    await memberPage.goto(`/o/${slug}/finance`);
    await expect(memberPage.getByText("We couldn't find that page")).toBeVisible();
    const res = await memberPage.request.get(`/api/orgs/${slug}/finance/export`);
    expect(res.status()).toBe(403);

    const org = await db.organization.findUniqueOrThrow({ where: { slug } });
    expect(await db.subscriptionInvoice.count({ where: { organizationId: org.id } })).toBe(0);
  });
});
