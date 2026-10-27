import { DateTime } from "luxon";

export type RecurrenceRule = {
  timezone: string;
  startDate: string; // YYYY-MM-DD local
  startTime: string; // HH:mm local
  durationMinutes: number;
  frequency: "NONE" | "DAILY" | "WEEKLY";
  interval: number;
  byWeekday: number[]; // ISO 1..7
  untilDate?: string | null; // inclusive, local
};

export type Slot = { startsAt: Date; endsAt: Date };

const MAX_SLOTS = 1000;

function localStart(date: DateTime, time: string, zone: string): DateTime {
  const [h, m] = time.split(":").map(Number) as [number, number];
  // Luxon resolves DST gaps by moving forward and ambiguous times to the earlier offset.
  return DateTime.fromObject({ year: date.year, month: date.month, day: date.day, hour: h, minute: m }, { zone });
}

/**
 * Expands a recurrence rule into concrete UTC slots whose start lies in [from, to).
 * Wall-clock time is preserved across DST changes in the meeting's own time zone.
 */
export function expandRecurrence(rule: RecurrenceRule, from: Date, to: Date): Slot[] {
  const zone = rule.timezone;
  const start = DateTime.fromISO(rule.startDate, { zone });
  if (!start.isValid) throw new Error("Invalid start date or time zone");
  const until = rule.untilDate ? DateTime.fromISO(rule.untilDate, { zone }).endOf("day") : null;
  const interval = Math.max(1, rule.interval || 1);
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const out: Slot[] = [];

  const push = (day: DateTime) => {
    const s = localStart(day, rule.startTime, zone);
    const ms = s.toMillis();
    if (ms >= fromMs && ms < toMs) {
      out.push({ startsAt: s.toUTC().toJSDate(), endsAt: s.plus({ minutes: rule.durationMinutes }).toUTC().toJSDate() });
    }
  };

  if (rule.frequency === "NONE") {
    push(start);
    return out;
  }

  // Begin iterating a little before `from` (in local days) but never before the series start.
  const fromLocal = DateTime.fromJSDate(from, { zone }).startOf("day").minus({ days: 1 });
  let cursor = fromLocal > start ? fromLocal : start;

  if (rule.frequency === "DAILY") {
    const offset = Math.round(cursor.startOf("day").diff(start.startOf("day"), "days").days);
    const rem = offset % interval;
    if (rem) cursor = cursor.plus({ days: interval - rem });
    for (let i = 0; i < 5000 && out.length < MAX_SLOTS; i++) {
      if (until && cursor > until) break;
      if (localStart(cursor, rule.startTime, zone).toMillis() >= toMs) break;
      push(cursor);
      cursor = cursor.plus({ days: interval });
    }
    return out;
  }

  // WEEKLY
  const weekdays = (rule.byWeekday.length ? [...new Set(rule.byWeekday)] : [start.weekday]).filter((d) => d >= 1 && d <= 7).sort();
  const startWeek = start.startOf("week"); // ISO weeks start on Monday
  for (let i = 0; i < 5000 && out.length < MAX_SLOTS; i++) {
    if (until && cursor > until) break;
    if (localStart(cursor, rule.startTime, zone).toMillis() >= toMs) break;
    const weeksSince = Math.round(cursor.startOf("week").diff(startWeek, "weeks").weeks);
    if (cursor >= start && weeksSince % interval === 0 && weekdays.includes(cursor.weekday)) push(cursor);
    cursor = cursor.plus({ days: 1 });
  }
  return out;
}

export function describeRecurrence(rule: Pick<RecurrenceRule, "frequency" | "interval" | "byWeekday" | "untilDate">): string {
  const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let base: string;
  if (rule.frequency === "NONE") return "One-time";
  if (rule.frequency === "DAILY") base = rule.interval > 1 ? `Every ${rule.interval} days` : "Daily";
  else {
    const days = [...rule.byWeekday].sort().map((d) => names[d]).join(", ");
    base = `${rule.interval > 1 ? `Every ${rule.interval} weeks` : "Weekly"}${days ? ` on ${days}` : ""}`;
  }
  return rule.untilDate ? `${base} until ${rule.untilDate}` : base;
}
