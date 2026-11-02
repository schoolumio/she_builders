/** Time helpers for server components (each request renders once, so reading the clock is safe). */
export function now(): Date {
  return new Date();
}

export function daysAgo(days: number): Date {
  return new Date(now().getTime() - days * 86_400_000);
}
