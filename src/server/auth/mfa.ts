import "server-only";
import QRCode from "qrcode";
import { z } from "zod";
import { db } from "../db";
import { decrypt, encrypt, randomToken, sha256 } from "../crypto";
import { ConflictError, RateLimitError, UnauthenticatedError, ValidationError } from "../errors";
import { parseInput } from "../validate";
import { audit } from "../audit";
import { rateLimit } from "../rate-limit";
import { env } from "../env";
import { verifyPassword } from "./password";
import { invalidateAllUserSessions } from "./session";
import { generateTotpSecret, otpauthUri, verifyTotp } from "./totp";
import { brand } from "@/config/brand";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_CHALLENGE_ATTEMPTS = 5;
const RECOVERY_CODES = 10;

function recoveryCode() {
  // 10 characters from an unambiguous alphabet, shown as XXXXX-XXXXX.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = Buffer.from(randomToken(16), "base64url");
  let s = "";
  for (let i = 0; i < 10; i++) s += alphabet[bytes[i]! % alphabet.length];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

const normaliseRecovery = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Whether platform staff must use two-factor authentication (always in production unless explicitly disabled). */
export function platformMfaRequired() {
  const flag = process.env.PLATFORM_REQUIRE_MFA;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return env.isProduction;
}

/** Step 1 of enrolment: create a pending secret and return what the authenticator app needs. */
export async function beginMfaEnrolment(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.mfaEnabledAt) throw new ConflictError("Two-factor authentication is already on.");
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: userId }, data: { mfaPendingSecretEnc: encrypt(secret) } });
  const uri = otpauthUri(secret, user.email, brand.productName);
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { secret, uri, qrSvg };
}

/** Step 2: confirm with a code from the app. Returns one-time recovery codes (shown once, stored hashed). */
export async function confirmMfaEnrolment(userId: string, input: unknown, currentSessionToken?: string) {
  const { code } = parseInput(z.object({ code: z.string().trim().min(6).max(10) }), input);
  await rateLimit(`mfa:enrol:${userId}`, 10, 900);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.mfaEnabledAt) throw new ConflictError("Two-factor authentication is already on.");
  if (!user.mfaPendingSecretEnc) throw new ValidationError("Start the set-up again.");
  const secret = decrypt(user.mfaPendingSecretEnc);
  const step = verifyTotp(secret, code);
  if (step === null) throw new ValidationError("That code isn't right. Check your device's clock and try the newest code.", { code: "Incorrect code." });
  const codes = Array.from({ length: RECOVERY_CODES }, recoveryCode);
  await db.user.update({
    where: { id: userId },
    data: {
      mfaSecretEnc: user.mfaPendingSecretEnc,
      mfaPendingSecretEnc: null,
      mfaEnabledAt: new Date(),
      mfaLastUsedStep: step,
      mfaRecoveryHashes: codes.map((c) => sha256(normaliseRecovery(c))),
    },
  });
  // Other devices signed in before two-factor was enabled must sign in again.
  await invalidateAllUserSessions(userId, currentSessionToken);
  await audit({ actorId: userId, action: "user.mfa_enabled", targetType: "User", targetId: userId });
  return codes;
}

export async function disableMfa(userId: string, input: unknown) {
  const d = parseInput(z.object({ password: z.string().min(1).max(200), code: z.string().trim().min(6).max(12) }), input);
  await rateLimit(`mfa:disable:${userId}`, 5, 900);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaEnabledAt || !user.mfaSecretEnc) throw new ConflictError("Two-factor authentication is not on.");
  if (!user.passwordHash || !(await verifyPassword(d.password, user.passwordHash))) throw new ValidationError("Your password is not correct.", { password: "Incorrect password." });
  if (!(await checkSecondFactor(user.id, d.code))) throw new ValidationError("That code isn't right.", { code: "Incorrect code." });
  await db.user.update({ where: { id: userId }, data: { mfaSecretEnc: null, mfaPendingSecretEnc: null, mfaEnabledAt: null, mfaLastUsedStep: null, mfaRecoveryHashes: [] } });
  await audit({ actorId: userId, action: "user.mfa_disabled", targetType: "User", targetId: userId });
}

export async function regenerateRecoveryCodes(userId: string, input: unknown) {
  const { code } = parseInput(z.object({ code: z.string().trim().min(6).max(12) }), input);
  if (!(await checkSecondFactor(userId, code))) throw new ValidationError("That code isn't right.", { code: "Incorrect code." });
  const codes = Array.from({ length: RECOVERY_CODES }, recoveryCode);
  await db.user.update({ where: { id: userId }, data: { mfaRecoveryHashes: codes.map((c) => sha256(normaliseRecovery(c))) } });
  await audit({ actorId: userId, action: "user.mfa_recovery_regenerated", targetType: "User", targetId: userId });
  return codes;
}

/** Accepts a current TOTP code (with replay protection) or consumes a recovery code. */
export async function checkSecondFactor(userId: string, code: string): Promise<boolean> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaSecretEnc) return false;
  const step = verifyTotp(decrypt(user.mfaSecretEnc), code, { lastUsedStep: user.mfaLastUsedStep });
  if (step !== null) {
    // Conditional update prevents the same code being accepted twice concurrently.
    const res = await db.user.updateMany({ where: { id: userId, OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }] }, data: { mfaLastUsedStep: step } });
    return res.count === 1;
  }
  const hash = sha256(normaliseRecovery(code));
  if (!user.mfaRecoveryHashes.includes(hash)) return false;
  const remaining = user.mfaRecoveryHashes.filter((h) => h !== hash);
  const res = await db.user.updateMany({ where: { id: userId, mfaRecoveryHashes: { has: hash } }, data: { mfaRecoveryHashes: remaining } });
  if (res.count === 1) await audit({ actorId: userId, action: "user.mfa_recovery_code_used", targetType: "User", targetId: userId, metadata: { remaining: remaining.length } });
  return res.count === 1;
}

/** After a correct password for an MFA-enabled account: issue a short-lived, single-use challenge. */
export async function createMfaChallenge(userId: string) {
  const token = randomToken(32);
  await db.$transaction([
    db.authToken.updateMany({ where: { userId, type: "MFA_CHALLENGE", usedAt: null }, data: { usedAt: new Date() } }),
    db.authToken.create({ data: { userId, type: "MFA_CHALLENGE", tokenHash: sha256(token), expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) } }),
  ]);
  return token;
}

/** Completes sign-in. Returns the user id; the challenge is burned on success or after too many attempts. */
export async function completeMfaChallenge(token: string, input: unknown): Promise<string> {
  const { code } = parseInput(z.object({ code: z.string().trim().min(6).max(12) }), input);
  if (!token || token.length > 200) throw new UnauthenticatedError("Your sign-in has expired. Please sign in again.");
  const record = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.type !== "MFA_CHALLENGE" || record.usedAt || record.expiresAt < new Date()) {
    throw new UnauthenticatedError("Your sign-in has expired. Please sign in again.");
  }
  if (record.attempts >= MAX_CHALLENGE_ATTEMPTS) throw new RateLimitError("Too many incorrect codes. Please sign in again.");
  await db.authToken.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
  if (!(await checkSecondFactor(record.userId, code))) {
    if (record.attempts + 1 >= MAX_CHALLENGE_ATTEMPTS) await db.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    throw new ValidationError("That code isn't right.", { code: "Incorrect code." });
  }
  const claimed = await db.authToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) throw new UnauthenticatedError("Your sign-in has expired. Please sign in again.");
  return record.userId;
}

export async function mfaStatus(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaEnabledAt: true, mfaRecoveryHashes: true } });
  return { enabled: !!u.mfaEnabledAt, enabledAt: u.mfaEnabledAt, recoveryCodesLeft: u.mfaRecoveryHashes.length };
}
