"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/** Captures the browser's IANA time zone so schedules display in local time from the start. */
export function TimezoneInput({ name = "timezone" }: { name?: string }) {
  const tz = useSyncExternalStore(subscribe, browserZone, () => "UTC");
  return <input type="hidden" name={name} value={tz} />;
}
