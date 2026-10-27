import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, SESSION_COOKIE, validateSessionToken } from "./session";
import { env } from "../env";
import { sha256 } from "../crypto";

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Resolves the signed-in user for this request (memoised per request). */
export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await validateSessionToken(token);
  if (!result) return null;
  if (result.refreshed) {
    try {
      jar.set(SESSION_COOKIE, token, cookieOptions(result.session.expiresAt));
    } catch {
      // Cookies are read-only during server component rendering; refreshed on next action.
    }
  }
  const { passwordHash: _ph, ...user } = result.user;
  return user;
});

export async function requireUser(next?: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

export async function requirePlatformAdmin() {
  const user = await requireUser("/platform");
  if (!user.platformRole) redirect("/app");
  return user;
}

export function cookieOptions(expires: Date) {
  return { httpOnly: true, secure: env.secureCookies, sameSite: "lax" as const, path: "/", expires };
}

export async function requestMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return { ip, ipHash: sha256(`ip:${ip}`).slice(0, 32), userAgent: h.get("user-agent") };
}

export async function startSession(userId: string) {
  const meta = await requestMeta();
  const { token, expiresAt } = await createSession(userId, { userAgent: meta.userAgent, ipHash: meta.ipHash });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}
