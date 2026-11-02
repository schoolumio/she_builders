import { describe, expect, it } from "vitest";
import { contrastRatio, isAccessibleAccent } from "@/lib/color";

describe("colour contrast", () => {
  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("accepts dark accents and rejects light ones", () => {
    expect(isAccessibleAccent("#4e3170")).toBe(true);
    expect(isAccessibleAccent("#c49a3a")).toBe(false);
    expect(isAccessibleAccent("#ffff00")).toBe(false);
  });
});
