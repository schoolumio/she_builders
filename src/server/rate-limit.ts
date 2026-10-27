import "server-only";
import { db } from "./db";
import { RateLimitError } from "./errors";

/**
 * Fixed-window rate limiter backed by Postgres so limits hold across server instances.
 * `key` should include the action and the subject (e.g. `login:ip:abc`).
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  if (process.env.DISABLE_RATE_LIMIT === "1" && process.env.APP_ENV !== "production") return;
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count") VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"`;
  if ((rows[0]?.count ?? 0) > limit) throw new RateLimitError();
}
