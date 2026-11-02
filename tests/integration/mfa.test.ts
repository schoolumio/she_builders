import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../support/db";
import { addMember, createOrg, createUser, ctxFor } from "../support/factories";
import { beginMfaEnrolment, checkSecondFactor, completeMfaChallenge, confirmMfaEnrolment, createMfaChallenge, disableMfa } from "@/server/auth/mfa";
import { stepAt, totpAt } from "@/server/auth/totp";
import { hashPassword } from "@/server/auth/password";
import { updateCommunitySettings } from "@/server/orgs/service";
import { listOrganizationsForPlatform } from "@/server/platform/service";
import { ForbiddenError, RateLimitError, UnauthenticatedError, ValidationError } from "@/server/errors";

beforeEach(resetDb);
afterEach(() => {
  delete process.env.PLATFORM_REQUIRE_MFA;
});

const now = (secret: string, offset = 0) => totpAt(secret, stepAt(Date.now()) + offset);

async function enrolled() {
  const user = await createUser({ passwordHash: await hashPassword("correct horse battery") });
  const { secret } = await beginMfaEnrolment(user.id);
  const codes = await confirmMfaEnrolment(user.id, { code: now(secret) });
  return { user: await db.user.findUniqueOrThrow({ where: { id: user.id } }), secret, codes };
}

describe("two-factor enrolment", () => {
  it("requires a valid code, stores the secret encrypted and recovery codes hashed", async () => {
    const user = await createUser();
    const { secret } = await beginMfaEnrolment(user.id);
    await expect(confirmMfaEnrolment(user.id, { code: "000000" })).rejects.toBeInstanceOf(ValidationError);
    const codes = await confirmMfaEnrolment(user.id, { code: now(secret) });
    expect(codes).toHaveLength(10);
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.mfaEnabledAt).not.toBeNull();
    expect(row.mfaSecretEnc).not.toContain(secret);
    expect(row.mfaRecoveryHashes.some((h) => codes.includes(h))).toBe(false);
  });

  it("signs out other sessions when enabled", async () => {
    const user = await createUser();
    await db.session.create({ data: { id: "other-session", userId: user.id, expiresAt: new Date(Date.now() + 1e6) } });
    const { secret } = await beginMfaEnrolment(user.id);
    await confirmMfaEnrolment(user.id, { code: now(secret) });
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe("second factor", () => {
  it("rejects a code that was already used (replay)", async () => {
    const { user, secret } = await enrolled();
    const next = now(secret, 1);
    expect(await checkSecondFactor(user.id, next)).toBe(true);
    expect(await checkSecondFactor(user.id, next)).toBe(false);
  });

  it("accepts each recovery code once", async () => {
    const { user, codes } = await enrolled();
    expect(await checkSecondFactor(user.id, codes[0]!.toLowerCase())).toBe(true);
    expect(await checkSecondFactor(user.id, codes[0]!)).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).mfaRecoveryHashes).toHaveLength(9);
  });

  it("login challenges are single use and lock after too many wrong codes", async () => {
    const { user, secret } = await enrolled();
    const token = await createMfaChallenge(user.id);
    expect(await completeMfaChallenge(token, { code: now(secret, 1) })).toBe(user.id);
    await expect(completeMfaChallenge(token, { code: now(secret, 1) })).rejects.toBeInstanceOf(UnauthenticatedError);

    const t2 = await createMfaChallenge(user.id);
    for (let i = 0; i < 5; i++) await expect(completeMfaChallenge(t2, { code: "000000" })).rejects.toBeTruthy();
    await expect(completeMfaChallenge(t2, { code: now(secret) })).rejects.toSatisfy((e) => e instanceof UnauthenticatedError || e instanceof RateLimitError);
  });

  it("can be turned off only with the password and a valid code", async () => {
    const { user, secret } = await enrolled();
    await expect(disableMfa(user.id, { password: "wrong", code: now(secret, 1) })).rejects.toBeInstanceOf(ValidationError);
    await expect(disableMfa(user.id, { password: "correct horse battery", code: "000000" })).rejects.toBeInstanceOf(ValidationError);
    await disableMfa(user.id, { password: "correct horse battery", code: now(secret, 1) });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).mfaEnabledAt).toBeNull();
  });
});

describe("two-factor policies", () => {
  it("organisations can require two-factor for elevated roles; without it those roles are paused", async () => {
    const { user: owner } = await enrolled();
    const org = await createOrg(owner);
    const finance = await addMember(org, ["FINANCE_ADMIN"]);
    const host = await addMember(org, ["HOST"]);
    await expect(updateCommunitySettings(await ctxFor(finance, org), { requireMfaForAdmins: "on" })).rejects.toBeInstanceOf(ForbiddenError);
    await updateCommunitySettings(await ctxFor(owner, org), { requireMfaForAdmins: "on" });
    const fctx = await ctxFor(finance, org);
    expect(fctx.mfaRestricted).toBe(true);
    expect(fctx.permissions.has("finance.view")).toBe(false);
    const hctx = await ctxFor(host, org);
    expect(hctx.mfaRestricted).toBe(false);
    expect(hctx.permissions.has("meetings.create")).toBe(true);
    expect((await ctxFor(owner, org)).permissions.has("finance.view")).toBe(true);
  });

  it("owners must have two-factor before requiring it", async () => {
    const owner = await createUser();
    const org = await createOrg(owner);
    await expect(updateCommunitySettings(await ctxFor(owner, org), { requireMfaForAdmins: "on" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("platform staff need two-factor when required", async () => {
    process.env.PLATFORM_REQUIRE_MFA = "true";
    const staff = await createUser({ platformRole: "SUPPORT" });
    await expect(listOrganizationsForPlatform(staff)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listOrganizationsForPlatform({ ...staff, mfaEnabledAt: new Date() })).resolves.toEqual([]);
  });
});
