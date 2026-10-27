/**
 * Promotes an EXISTING, email-verified user to platform super administrator.
 * Usage: npm run admin:create -- someone@example.com
 * Running it requires database access, which is the trust boundary for bootstrapping.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const role = process.argv[3] === "SUPPORT" ? "SUPPORT" : "SUPER_ADMIN";
  if (!email) throw new Error("Usage: npm run admin:create -- <email> [SUPER_ADMIN|SUPPORT]");
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error("No user with that email. Register through the website first.");
  if (!user.emailVerifiedAt) throw new Error("Verify the email address before granting platform access.");
  await db.user.update({ where: { id: user.id }, data: { platformRole: role } });
  await db.auditLog.create({ data: { actorId: null, action: "platform.admin_granted", targetType: "User", targetId: user.id, metadata: { role, via: "cli" } } });
  console.log(`✓ ${email} is now ${role}`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
