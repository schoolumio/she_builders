import { DateTime } from "luxon";

export function isValidTimezone(tz: string): boolean {
  return DateTime.local().setZone(tz).isValid;
}

export function formatInZone(date: Date, tz: string, format = "ccc d LLL yyyy, HH:mm"): string {
  return DateTime.fromJSDate(date).setZone(isValidTimezone(tz) ? tz : "UTC").toFormat(format);
}

export function zoneAbbrev(date: Date, tz: string): string {
  return DateTime.fromJSDate(date).setZone(isValidTimezone(tz) ? tz : "UTC").toFormat("ZZZZ");
}

export function todayInZone(tz: string): string {
  return DateTime.now().setZone(isValidTimezone(tz) ? tz : "UTC").toISODate()!;
}

export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 7, short: "Sun", long: "Sunday" },
] as const;

export function commonTimezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "Africa/Lagos", "Europe/London", "America/New_York"];
  }
}
