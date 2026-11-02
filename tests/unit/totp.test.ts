import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, otpauthUri, stepAt, totpAt, verifyTotp } from "@/server/auth/totp";

// RFC 6238 Appendix B secret ("12345678901234567890", SHA-1).
const SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("matches the RFC 6238 SHA-1 test vectors (last 6 digits)", () => {
    expect(SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    const vectors: [number, string][] = [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"]];
    for (const [t, code] of vectors) expect(totpAt(SECRET, stepAt(t * 1000))).toBe(code);
  });

  it("round-trips base32", () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });

  it("accepts ±1 step and rejects replays and garbage", () => {
    const time = 1_700_000_000_000;
    const step = stepAt(time);
    expect(verifyTotp(SECRET, totpAt(SECRET, step), { time })).toBe(step);
    expect(verifyTotp(SECRET, totpAt(SECRET, step - 1), { time })).toBe(step - 1);
    expect(verifyTotp(SECRET, totpAt(SECRET, step - 3), { time })).toBeNull();
    expect(verifyTotp(SECRET, totpAt(SECRET, step), { time, lastUsedStep: step })).toBeNull();
    expect(verifyTotp(SECRET, "12345", { time })).toBeNull();
    expect(verifyTotp(SECRET, "abcdef", { time })).toBeNull();
  });

  it("builds an otpauth URI", () => {
    expect(otpauthUri(SECRET, "a@b.test", "Prayer Community Platform")).toBe(
      "otpauth://totp/Prayer%20Community%20Platform%3Aa%40b.test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Prayer%20Community%20Platform&algorithm=SHA1&digits=6&period=30",
    );
  });
});
