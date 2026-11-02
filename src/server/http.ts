import "server-only";
import { NextResponse } from "next/server";
import { isAppError } from "./errors";
import { errorMeta, log } from "./log";
import { env } from "./env";
import { randomToken } from "./crypto";

/** CSRF defence for cookie-authenticated JSON route handlers. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = new URL(env.appUrl).origin;
  const host = req.headers.get("host");
  if (origin && (origin === allowed || (host && new URL(origin).host === host))) return;
  throw Object.assign(new Error("Cross-origin request refused"), { status: 403 });
}

export function jsonError(e: unknown) {
  if (isAppError(e)) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  const status = (e as { status?: number })?.status;
  if (status === 403) return NextResponse.json({ error: "Forbidden" }, { status });
  const ref = randomToken(6);
  log.error("api.failed", { ref, ...errorMeta(e) });
  return NextResponse.json({ error: `Something went wrong (ref ${ref}).` }, { status: 500 });
}
