"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the server page periodically (e.g. while a payment awaits provider confirmation). */
export function AutoRefresh({ seconds, maxTimes }: { seconds: number; maxTimes: number }) {
  const router = useRouter();
  const count = useRef(0);
  useEffect(() => {
    const t = setInterval(() => {
      if (count.current++ >= maxTimes) return clearInterval(t);
      router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds, maxTimes]);
  return <p className="mt-2 text-xs text-muted" aria-live="polite">This page checks for updates automatically.</p>;
}
