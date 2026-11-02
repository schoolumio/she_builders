import { defineConfig, devices } from "@playwright/test";
import { E2E_DB, E2E_PORT } from "./e2e/env";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${E2E_PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    // Requires `npm run build` first.
    command: `npx next start -p ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DB,
      APP_URL: `http://localhost:${E2E_PORT}`,
      APP_ENV: "development",
      PAYMENTS_SIMULATOR_ENABLED: "true",
      PAYMENTS_SIMULATOR_SECRET: "e2e-simulator-secret",
      EMAIL_DRIVER: "log",
      BILLING_PROVIDER: "none",
      DISABLE_RATE_LIMIT: "1",
      CRON_SECRET: "e2e-cron",
      APP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
    },
  },
});
