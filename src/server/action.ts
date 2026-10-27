import "server-only";
import { unstable_rethrow } from "next/navigation";
import { isAppError, ValidationError } from "./errors";
import { errorMeta, log } from "./log";
import { randomToken } from "./crypto";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Echo of submitted values so forms can re-populate after validation errors. */
  values?: Record<string, string>;
} | null;

function echo(fd?: FormData): Record<string, string> | undefined {
  if (!fd) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string" || k.startsWith("$ACTION") || /password|token|account_?number/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Wraps a server action body: converts AppErrors into form state, hides internal errors behind a
 * correlation id, and lets Next.js redirects propagate.
 */
export async function runAction(fd: FormData | undefined, fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    const res = await fn();
    return res ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ValidationError) return { ok: false, message: e.message, fieldErrors: e.fieldErrors, values: echo(fd) };
    if (isAppError(e)) return { ok: false, message: e.message, values: echo(fd) };
    const ref = randomToken(6);
    log.error("action.failed", { ref, ...errorMeta(e) });
    return { ok: false, message: `Something went wrong. Please try again. (ref ${ref})`, values: echo(fd) };
  }
}
