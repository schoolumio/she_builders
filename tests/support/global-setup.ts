import { execSync } from "node:child_process";

/** Applies migrations to the dedicated test database once per run. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://prayer:prayer@localhost:5432/prayer_test?schema=public";
  if (!/test/i.test(url)) throw new Error("Refusing to run tests against a database whose name does not contain 'test'.");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
