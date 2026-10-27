import "server-only";

/** Centralised, typed access to server environment variables. */
export const env = {
  get appEnv(): "development" | "staging" | "production" | "test" {
    if (process.env.NODE_ENV === "test") return "test";
    const v = process.env.APP_ENV;
    return v === "production" || v === "staging" ? v : "development";
  },
  get isProduction() {
    return this.appEnv === "production";
  },
  get appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get encryptionKey() {
    return process.env.APP_ENCRYPTION_KEY ?? "";
  },
  get cronSecret() {
    return process.env.CRON_SECRET ?? "";
  },
  get secureCookies() {
    return this.appUrl.startsWith("https://");
  },
};

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}
