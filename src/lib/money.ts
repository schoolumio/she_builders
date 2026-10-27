/** Currencies supported for display. Minor-unit exponent per ISO 4217. */
const EXPONENT: Record<string, number> = { JPY: 0, KRW: 0, UGX: 0, RWF: 0, XOF: 0, XAF: 0 };

export function currencyExponent(currency: string): number {
  return EXPONENT[currency.toUpperCase()] ?? 2;
}

export function toMinorUnits(major: number, currency: string): number {
  return Math.round(major * 10 ** currencyExponent(currency));
}

export function fromMinorUnits(minor: number, currency: string): number {
  return minor / 10 ** currencyExponent(currency);
}

export function formatMoney(minor: number | null | undefined, currency: string, locale = "en"): string {
  if (minor == null) return "—";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "symbol" }).format(
      fromMinorUnits(minor, currency),
    );
  } catch {
    return `${currency} ${fromMinorUnits(minor, currency).toFixed(currencyExponent(currency))}`;
  }
}

/** Platform fee in minor units for an amount, given basis points. Always rounds down (never over-charges). */
export function platformFee(amountMinor: number, bps: number): number {
  if (bps <= 0) return 0;
  return Math.floor((amountMinor * bps) / 10_000);
}
