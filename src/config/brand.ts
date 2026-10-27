/**
 * Platform branding. Every user-visible product/company name comes from here so the working name
 * can change without code edits. Organisations additionally apply their own logo and accent colour.
 */
export const brand = {
  productName: process.env.BRAND_PRODUCT_NAME ?? "Prayer Community Platform",
  shortName: process.env.BRAND_SHORT_NAME ?? "Prayer Community",
  companyName: process.env.BRAND_COMPANY_NAME ?? "BridgeCodes",
  legalEntity: process.env.BRAND_LEGAL_ENTITY ?? "Numi Innovations Ltd",
  supportEmail: process.env.BRAND_SUPPORT_EMAIL ?? "support@example.com",
  securityEmail: process.env.SECURITY_CONTACT_EMAIL ?? "security@example.com",
} as const;
