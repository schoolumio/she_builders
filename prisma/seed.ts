/**
 * Seeds subscription plans (always) and, outside production, clearly labelled SAMPLE data for
 * development and demonstrations. Run with `npm run db:seed`. Set SEED_DEMO=0 to skip sample data.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";
import { DateTime } from "luxon";
import { seedPlans } from "./seed-plans";
import { DEFAULT_GIFTS } from "../src/server/gifts/defaults";

const db = new PrismaClient();

function hash(password: string) {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, 32, { N: 32768, r: 8, p: 3, maxmem: 128 * 32768 * 8 * 2 });
  return `scrypt$32768$8$3$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function main() {
  await seedPlans(db);
  console.log("✓ Plans seeded");

  const isProd = process.env.APP_ENV === "production";
  if (isProd || process.env.SEED_DEMO === "0") return;
  if (await db.organization.findUnique({ where: { slug: "sample-prayer-circle" } })) {
    console.log("• Sample data already present");
    await seedSampleGroupContent();
    return;
  }

  const password = "SamplePass123!";
  const mk = (email: string, name: string) =>
    db.user.create({ data: { email, name, passwordHash: hash(password), emailVerifiedAt: new Date(), timezone: "Africa/Lagos" } });
  const owner = await mk("owner@sample.test", "Sample Owner");
  const coordinator = await mk("coordinator@sample.test", "Sample Prayer Coordinator");
  const finance = await mk("finance@sample.test", "Sample Finance Admin");
  const host = await mk("host@sample.test", "Sample Host");
  const member = await mk("member@sample.test", "Sample Member");

  const growth = await db.plan.findUniqueOrThrow({ where: { code: "MINISTRY" } });
  const org = await db.organization.create({
    data: {
      slug: "sample-prayer-circle",
      name: "Sample Prayer Circle (demo data)",
      tagline: "SAMPLE DATA — a fictional community for demonstrations",
      description: "This organisation and everything in it is sample data created by the development seed. It is not a real community.",
      country: "NG",
      timezone: "Africa/Lagos",
      defaultCurrency: "NGN",
      visibility: "UNLISTED",
      joinPolicy: "APPROVAL",
      termsAcceptedAt: new Date(),
      termsAcceptedById: owner.id,
      fundraisingEnabled: true,
    },
  });
  const roles = [
    [owner, ["OWNER", "MEMBER"]],
    [coordinator, ["PRAYER_COORDINATOR", "MEMBER"]],
    [finance, ["FINANCE_ADMIN", "MEMBER"]],
    [host, ["HOST", "MEMBER"]],
    [member, ["MEMBER"]],
  ] as const;
  for (const [u, r] of roles) {
    await db.membership.create({ data: { organizationId: org.id, userId: u.id, roles: [...r], status: "ACTIVE", joinedAt: new Date() } });
  }
  await db.subscription.create({ data: { organizationId: org.id, planId: growth.id, status: "ACTIVE", currentPeriodStart: new Date(), billingProvider: "manual" } });
  await db.virtualGift.createMany({ data: DEFAULT_GIFTS.map((g, i) => ({ ...g, organizationId: org.id, position: i })) });
  const group = await db.communityGroup.create({ data: { organizationId: org.id, name: "Morning Intercessors (sample)" } });
  await db.groupMembership.createMany({
    data: [member, host, coordinator].map((u) => ({ organizationId: org.id, groupId: group.id, userId: u.id })),
  });
  const today = DateTime.now().setZone("Africa/Lagos").toISODate()!;
  await db.prayerPoint.create({
    data: { organizationId: org.id, forDate: today, title: "Sample prayer point", body: "Pray for peace and wisdom in our families. (Sample data)", scriptureRefs: ["Philippians 4:6-7"], status: "PUBLISHED", publishedAt: new Date(), authorId: coordinator.id },
  });
  await db.announcement.create({
    data: { organizationId: org.id, title: "Welcome to the sample community", body: "This announcement is sample data for demonstration purposes.", status: "PUBLISHED", publishedAt: new Date(), pinned: true, authorId: owner.id },
  });
  await db.meeting.create({
    data: {
      organizationId: org.id,
      title: "Weekly prayer line (sample)",
      description: "Sample recurring WhatsApp meeting.",
      mode: "WHATSAPP",
      externalUrl: "https://chat.whatsapp.com/SAMPLELINK",
      externalInstructions: "Join the group and tap the call button at 9pm.",
      timezone: "Africa/Lagos",
      startDate: today,
      startTime: "21:00",
      durationMinutes: 60,
      frequency: "WEEKLY",
      byWeekday: [1, 3, 5],
      createdById: owner.id,
      hosts: { create: [{ userId: host.id, role: "HOST" }] },
    },
  });
  await db.meeting.create({
    data: {
      organizationId: org.id,
      title: "In-app audio prayer (sample)",
      mode: "AUDIO",
      format: "BROADCAST",
      timezone: "Africa/Lagos",
      startDate: today,
      startTime: "06:00",
      durationMinutes: 45,
      frequency: "DAILY",
      createdById: owner.id,
      hosts: { create: [{ userId: host.id, role: "HOST" }] },
    },
  });
  await seedSampleGroupContent();
  console.log("✓ Sample organisation created: /o/sample-prayer-circle");
  console.log(`  Sample logins (password ${password}): owner@, coordinator@, finance@, host@, member@ sample.test`);
  console.log("  Run `npm run cron:tick` to generate meeting occurrences.");
}

/**
 * Content shared only with the sample group, so joining it shows something. Idempotent: safe to
 * re-run against a database that was seeded before this existed.
 */
async function seedSampleGroupContent() {
  const org = await db.organization.findUnique({ where: { slug: "sample-prayer-circle" } });
  if (!org) return;
  const group = await db.communityGroup.findFirst({ where: { organizationId: org.id, name: "Morning Intercessors (sample)" } });
  if (!group) return;
  if (await db.meeting.findFirst({ where: { organizationId: org.id, groupId: group.id } })) return;
  const user = (email: string) => db.user.findUniqueOrThrow({ where: { email } });
  const [owner, coordinator, member] = await Promise.all([user("owner@sample.test"), user("coordinator@sample.test"), user("member@sample.test")]);
  const today = DateTime.now().setZone(org.timezone).toISODate()!;
  await db.communityGroup.update({ where: { id: group.id }, data: { description: "Early-morning intercession before work. Sample group for demonstrations." } });
  await db.groupMembership.updateMany({ where: { groupId: group.id, userId: coordinator.id }, data: { role: "LEADER" } });
  await db.meeting.create({
    data: {
      organizationId: org.id,
      title: "Morning intercession (sample)",
      description: "Group-only WhatsApp call. Sample data.",
      mode: "WHATSAPP",
      visibility: "GROUP",
      groupId: group.id,
      externalUrl: "https://chat.whatsapp.com/SAMPLEGROUPLINK",
      externalInstructions: "Join the group chat and tap the call button at 5:30am.",
      timezone: org.timezone,
      startDate: today,
      startTime: "05:30",
      durationMinutes: 30,
      frequency: "WEEKLY",
      byWeekday: [1, 2, 3, 4, 5],
      createdById: coordinator.id,
      hosts: { create: [{ userId: coordinator.id, role: "HOST" }] },
    },
  });
  await db.announcement.create({
    data: { organizationId: org.id, groupId: group.id, title: "This week's focus (sample)", body: "We are praying through Psalm 91 this week. Sample announcement visible only to this group.", status: "PUBLISHED", publishedAt: new Date(), authorId: owner.id },
  });
  await db.prayerRequest.create({
    data: { organizationId: org.id, authorId: member.id, title: "Job interview on Friday (sample)", body: "Please pray for calm and favour. Sample request shared only with the Morning Intercessors.", visibility: "GROUP", groupId: group.id },
  });
  console.log("✓ Sample group content added (meeting, announcement, prayer request)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
