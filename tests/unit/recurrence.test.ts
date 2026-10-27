import { describe, expect, it } from "vitest";
import { describeRecurrence, expandRecurrence } from "@/server/meetings/recurrence";

const iso = (d: Date) => d.toISOString();

describe("expandRecurrence", () => {
  it("expands a one-time meeting in its own time zone", () => {
    const slots = expandRecurrence(
      { timezone: "Africa/Lagos", startDate: "2026-11-02", startTime: "21:00", durationMinutes: 60, frequency: "NONE", interval: 1, byWeekday: [] },
      new Date("2026-11-01T00:00:00Z"),
      new Date("2026-12-01T00:00:00Z"),
    );
    expect(slots.map((s) => iso(s.startsAt))).toEqual(["2026-11-02T20:00:00.000Z"]); // Lagos is UTC+1
    expect(iso(slots[0]!.endsAt)).toBe("2026-11-02T21:00:00.000Z");
  });

  it("keeps the local wall-clock time across a DST change", () => {
    // London leaves BST on 25 Oct 2026 (UTC+1 → UTC+0).
    const slots = expandRecurrence(
      { timezone: "Europe/London", startDate: "2026-10-23", startTime: "07:00", durationMinutes: 30, frequency: "DAILY", interval: 1, byWeekday: [] },
      new Date("2026-10-22T00:00:00Z"),
      new Date("2026-10-28T00:00:00Z"),
    );
    expect(slots.map((s) => iso(s.startsAt))).toEqual([
      "2026-10-23T06:00:00.000Z",
      "2026-10-24T06:00:00.000Z",
      "2026-10-25T07:00:00.000Z",
      "2026-10-26T07:00:00.000Z",
      "2026-10-27T07:00:00.000Z",
    ]);
  });

  it("handles weekly meetings on selected weekdays with an interval and end date", () => {
    const slots = expandRecurrence(
      { timezone: "America/New_York", startDate: "2026-11-02", startTime: "19:30", durationMinutes: 60, frequency: "WEEKLY", interval: 2, byWeekday: [1, 3], untilDate: "2026-11-30" },
      new Date("2026-11-01T00:00:00Z"),
      new Date("2027-01-01T00:00:00Z"),
    );
    // Mon 2, Wed 4, (skip week of 9), Mon 16, Wed 18, (skip 23), Mon 30
    expect(slots.map((s) => iso(s.startsAt))).toEqual([
      "2026-11-03T00:30:00.000Z",
      "2026-11-05T00:30:00.000Z",
      "2026-11-17T00:30:00.000Z",
      "2026-11-19T00:30:00.000Z",
      "2026-12-01T00:30:00.000Z",
    ]);
  });

  it("supports daily intervals starting mid-window", () => {
    const slots = expandRecurrence(
      { timezone: "UTC", startDate: "2026-01-01", startTime: "05:00", durationMinutes: 15, frequency: "DAILY", interval: 3, byWeekday: [] },
      new Date("2026-01-05T00:00:00Z"),
      new Date("2026-01-12T00:00:00Z"),
    );
    expect(slots.map((s) => iso(s.startsAt))).toEqual(["2026-01-07T05:00:00.000Z", "2026-01-10T05:00:00.000Z"]);
  });

  it("never yields slots before the series start", () => {
    const slots = expandRecurrence(
      { timezone: "Asia/Tokyo", startDate: "2026-06-10", startTime: "06:00", durationMinutes: 15, frequency: "WEEKLY", interval: 1, byWeekday: [1, 2, 3, 4, 5, 6, 7] },
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-06-12T00:00:00Z"),
    );
    expect(slots[0]!.startsAt.toISOString()).toBe("2026-06-09T21:00:00.000Z"); // 10 Jun 06:00 JST
  });

  it("describes rules for humans", () => {
    expect(describeRecurrence({ frequency: "WEEKLY", interval: 1, byWeekday: [5, 1], untilDate: null })).toBe("Weekly on Mon, Fri");
    expect(describeRecurrence({ frequency: "DAILY", interval: 2, byWeekday: [], untilDate: "2026-12-31" })).toBe("Every 2 days until 2026-12-31");
    expect(describeRecurrence({ frequency: "NONE", interval: 1, byWeekday: [], untilDate: null })).toBe("One-time");
  });
});
