import "server-only";
import type { AuthTokenType } from "@prisma/client";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";

const TTL_MS: Record<AuthTokenType, number> = {
  EMAIL_VERIFICATION: 48 * 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
};

/** Issues a single-use token. Previous unused tokens of the same type are invalidated. */
export async function issueAuthToken(userId: string, type: AuthTokenType): Promise<string> {
  const token = randomToken(32);
  await db.$transaction([
    db.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } }),
    db.authToken.create({ data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL_MS[type]) } }),
  ]);
  return token;
}

/** Atomically consumes a token. Returns the user id or null if invalid, expired or already used. */
export async function consumeAuthToken(token: string, type: AuthTokenType): Promise<string | null> {
  if (!token || token.length > 200) return null;
  const tokenHash = sha256(token);
  const record = await db.authToken.findUnique({ where: { tokenHash } });
  if (!record || record.type !== type || record.usedAt || record.expiresAt.getTime() < Date.now()) return null;
  // Conditional update guards against concurrent double use.
  const res = await db.authToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  return res.count === 1 ? record.userId : null;
}
