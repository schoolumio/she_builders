/**
 * Platform branding. Every user-visible product/company name comes from here so the name can change
 * without code edits. Organisations additionally apply their own logo and accent colour.
 */
export const brand = {
  productName: process.env.BRAND_PRODUCT_NAME ?? "AltarCall",
  shortName: process.env.BRAND_SHORT_NAME ?? "AltarCall",
  /** Trailing part of the short name shown in gold in the wordmark ("Altar" + "Call"). */
  wordmarkAccent: process.env.BRAND_WORDMARK_ACCENT ?? "Call",
  tagline: process.env.BRAND_TAGLINE ?? "Where prayer communities come together.",
  companyName: process.env.BRAND_COMPANY_NAME ?? "BridgeCodes",
  legalEntity: process.env.BRAND_LEGAL_ENTITY ?? "Numi Innovations Ltd",
  supportEmail: process.env.BRAND_SUPPORT_EMAIL ?? "support@example.com",
  securityEmail: process.env.SECURITY_CONTACT_EMAIL ?? "security@example.com",
} as const;
