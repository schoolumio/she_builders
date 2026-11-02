import type { Instrumentation } from "next";

/**
 * Captures unhandled server errors (server components, route handlers, actions) as structured
 * logs with the request path and digest — the digest is what users see on the error page.
 * Forward these logs to an error tracker; set ERROR_WEBHOOK_URL to also POST a minimal alert.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as Error & { digest?: string };
  const entry = {
    level: "error",
    msg: "request.unhandled_error",
    time: new Date().toISOString(),
    digest: e.digest,
    error: e.name,
    message: e.message?.slice(0, 500),
    path: request.path.split("?")[0],
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  };
  console.error(JSON.stringify(entry));
  const hook = process.env.ERROR_WEBHOOK_URL;
  if (hook) {
    try {
      await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `${entry.msg} ${entry.routePath} ${entry.digest ?? ""}` }) });
    } catch {
      // never let alerting break request handling
    }
  }
};
