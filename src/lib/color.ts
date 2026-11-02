/** WCAG 2.x relative luminance and contrast ratio for #rrggbb colours. */
function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error("Expected #rrggbb");
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x!, 16)) as [number, number, number];
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Accent colours are used as button backgrounds with white text, so they need ≥ 4.5:1 against white. */
export function isAccessibleAccent(hex: string): boolean {
  return contrastRatio(hex, "#ffffff") >= 4.5;
}
