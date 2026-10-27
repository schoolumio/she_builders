import { z } from "zod";
import { isValidTimezone } from "./time";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address." })).pipe(z.string().max(254));
export const passwordSchema = z
  .string()
  .min(10, { error: "Use at least 10 characters." })
  .max(200, { error: "Password is too long." });
export const nameSchema = z.string().trim().min(1, { error: "Required." }).max(120);
export const timezoneSchema = z.string().refine(isValidTimezone, { error: "Choose a valid time zone." });
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/, { error: "Use 3–48 lowercase letters, numbers or hyphens." });
export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { error: "Use a 3-letter currency code." });
export const countrySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, { error: "Choose a country." });
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
export const optionalHttpsUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => !v || /^https:\/\//i.test(v), { error: "Use a secure https:// link." });
export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD." });
export const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Use HH:mm." });
export const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal(""), z.boolean()])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true" || v === "1");
export const scriptureList = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(/[\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20),
  );

/** Convert FormData into a plain object (multi-value keys become arrays). */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const value = typeof v === "string" ? v : v;
    if (k in out) {
      const prev = out[k];
      out[k] = Array.isArray(prev) ? [...prev, value] : [prev, value];
    } else out[k] = value;
  }
  return out;
}
