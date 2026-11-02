import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { seedPlans } from "../prisma/seed-plans";
import { E2E_DB } from "./env";

/** Migrated e2e database, emptied of application data, with only the plan catalogue. */
export default async function globalSetup() {
  if (!/e2e/.test(E2E_DB)) throw new Error("Refusing to touch a database whose name does not contain 'e2e'");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: E2E_DB } });
  const db = new PrismaClient({ datasourceUrl: E2E_DB });
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await seedPlans(db);
  await db.$disconnect();
}
