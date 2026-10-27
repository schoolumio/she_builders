import { describe, expect, it } from "vitest";
import { classifyWhatsAppLink, safeExternalUrl, safeNextPath } from "@/lib/urls";
import { formatMoney, platformFee, toMinorUnits } from "@/lib/money";
import { buildIcs } from "@/server/meetings/ics";
import { sniffImage } from "@/server/storage";
import { _redactForTests } from "@/server/log";
import { decrypt, encrypt, signValue, verifySignedValue } from "@/server/crypto";
import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("external links", () => {
  it("accepts only https links without credentials", () => {
    expect(safeExternalUrl("https://chat.whatsapp.com/abc")).toBe("https://chat.whatsapp.com/abc");
    expect(safeExternalUrl("http://chat.whatsapp.com/abc")).toBeNull();
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("https://user:pw@evil.test")).toBeNull();
  });

  it("distinguishes WhatsApp group links from call links", () => {
    expect(classifyWhatsAppLink("https://chat.whatsapp.com/Invite123")?.kind).toBe("group");
    expect(classifyWhatsAppLink("https://call.whatsapp.com/voice/abc")?.kind).toBe("call");
    expect(classifyWhatsAppLink("https://wa.me/2348000000000")?.kind).toBe("chat");
    expect(classifyWhatsAppLink("https://whatsapp.evil.test/x")).toBeNull();
  });

  it("prevents open redirects after login", () => {
    expect(safeNextPath("/o/abc")).toBe("/o/abc");
    expect(safeNextPath("//evil.test")).toBe("/app");
    expect(safeNextPath("https://evil.test")).toBe("/app");
    expect(safeNextPath("/\\evil.test")).toBe("/app");
  });
});

describe("money", () => {
  it("converts to minor units by currency exponent", () => {
    expect(toMinorUnits(1500.5, "NGN")).toBe(150050);
    expect(toMinorUnits(1000, "JPY")).toBe(1000);
  });
  it("rounds platform fees down and never charges when bps is 0", () => {
    expect(platformFee(10_001, 150)).toBe(150);
    expect(platformFee(10_000, 0)).toBe(0);
  });
  it("formats money", () => {
    expect(formatMoney(150050, "USD")).toBe("$1,500.50");
    expect(formatMoney(null, "USD")).toBe("—");
  });
});

describe("ics", () => {
  it("escapes text and emits UTC times", () => {
    const ics = buildIcs("Cal", [{ uid: "1@x", title: "Prayer; night, together", startsAt: new Date("2026-01-01T20:00:00Z"), endsAt: new Date("2026-01-01T21:00:00Z") }]);
    expect(ics).toContain("DTSTART:20260101T200000Z");
    expect(ics).toContain("SUMMARY:Prayer\; night\\, together");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("upload sniffing", () => {
  it("identifies images by magic bytes and refuses SVG", () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe("png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
  });
});

describe("logging", () => {
  it("redacts sensitive keys", () => {
    const out = _redactForTests({ password: "x", nested: { accountNumber: "123", ok: 1 }, authorization: "Bearer y" }) as Record<string, unknown>;
    expect(out.password).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).accountNumber).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
    expect(out.authorization).toBe("[redacted]");
  });
});

describe("crypto", () => {
  it("round-trips encrypted values and rejects tampering", () => {
    const c = encrypt("secret");
    expect(decrypt(c)).toBe("secret");
    expect(() => decrypt(c.slice(0, -2) + "AA")).toThrow();
  });
  it("verifies signed values", () => {
    const s = signValue("user:MEETINGS");
    expect(verifySignedValue(s)).toBe("user:MEETINGS");
    expect(verifySignedValue(s.replace("MEETINGS", "PRAYER"))).toBeNull();
  });
  it("hashes and verifies passwords", async () => {
    const h = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});
