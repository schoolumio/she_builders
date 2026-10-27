import "server-only";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";

export const SESSION_COOKIE = "pcp_session";
const SESSION_DAYS = 30;
const REFRESH_THRESHOLD_DAYS = 15;
const DAY = 24 * 60 * 60 * 1000;

export async function createSession(userId: string, meta: { userAgent?: string | null; ipHash?: string | null } = {}) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
  await db.session.create({
    data: { id: sha256(token), userId, expiresAt, userAgent: meta.userAgent?.slice(0, 300) ?? null, ipHash: meta.ipHash ?? null },
  });
  return { token, expiresAt };
}

/** Validates a raw session token. Returns the session + user, extending expiry when close to lapsing. */
export async function validateSessionToken(token: string) {
  if (!token || token.length > 200) return null;
  const id = sha256(token);
  const session = await db.session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now() || session.user.status !== "ACTIVE") {
    await db.session.deleteMany({ where: { id } });
    return null;
  }
  let expiresAt = session.expiresAt;
  if (expiresAt.getTime() - Date.now() < REFRESH_THRESHOLD_DAYS * DAY) {
    expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
    await db.session.update({ where: { id }, data: { expiresAt, lastSeenAt: new Date() } });
  }
  return { session: { ...session, expiresAt }, user: session.user, refreshed: expiresAt !== session.expiresAt };
}

export async function invalidateSessionToken(token: string) {
  await db.session.deleteMany({ where: { id: sha256(token) } });
}

export async function invalidateAllUserSessions(userId: string, exceptToken?: string) {
  await db.session.deleteMany({
    where: { userId, ...(exceptToken ? { NOT: { id: sha256(exceptToken) } } : {}) },
  });
}
