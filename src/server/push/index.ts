import "server-only";
import webpush from "web-push";
import { z } from "zod";
import { db } from "../db";
import { ValidationError } from "../errors";
import { parseInput } from "../validate";
import { rateLimit } from "../rate-limit";
import { errorMeta, log } from "../log";

/**
 * Browser push (Web Push protocol, VAPID). Payloads are end-to-end encrypted to the browser by the
 * protocol; they still pass through the browser vendor's push service, so they carry only a short
 * title, a short body and an in-app link — never prayer-request content.
 */
export type PushPayload = { title: string; body?: string; link?: string; tag?: string };
export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export interface PushSender {
  send(target: PushTarget, payload: PushPayload): Promise<{ ok: true } | { ok: false; gone: boolean; status?: number }>;
}

export function vapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
  const subject = process.env.VAPID_SUBJECT ?? "";
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export function isPushConfigured() {
  return !!vapidConfig();
}

class WebPushSender implements PushSender {
  async send(target: PushTarget, payload: PushPayload) {
    const cfg = vapidConfig();
    if (!cfg) return { ok: false as const, gone: false };
    try {
      await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(payload), {
        vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey },
        TTL: 60 * 60 * 24,
        timeout: 10_000,
      });
      return { ok: true as const };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      return { ok: false as const, gone: status === 404 || status === 410, status };
    }
  }
}

let sender: PushSender | undefined;
export function getPushSender(): PushSender {
  sender ??= new WebPushSender();
  return sender;
}
/** Test hook. */
export function setPushSender(s: PushSender | undefined) {
  sender = s;
}

// Only real browser push services may be stored as endpoints (prevents using the server to call arbitrary URLs).
const PUSH_HOST_SUFFIXES = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "push.apple.com", "notify.windows.com", "push.services.mozilla.com", "android.googleapis.com"];

export function isAllowedPushEndpoint(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
    const host = u.hostname.toLowerCase();
    return PUSH_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
  } catch {
    return false;
  }
}

const b64url = z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/).min(16).max(200);
const subscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint, { error: "Unsupported push service." }),
  keys: z.object({ p256dh: b64url, auth: b64url }),
});

const MAX_PER_USER = 10;

export async function saveSubscription(userId: string, input: unknown, userAgent?: string | null) {
  if (!isPushConfigured()) throw new ValidationError("Browser notifications are not configured on this platform.");
  const d = parseInput(subscriptionSchema, input);
  await rateLimit(`push:subscribe:${userId}`, 20, 3600);
  // An endpoint belongs to exactly one browser profile; re-subscribing moves it to the current user.
  await db.pushSubscription.upsert({
    where: { endpoint: d.endpoint },
    create: { userId, endpoint: d.endpoint, p256dh: d.keys.p256dh, auth: d.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null },
    update: { userId, p256dh: d.keys.p256dh, auth: d.keys.auth, failureCount: 0, userAgent: userAgent?.slice(0, 300) ?? null },
  });
  const all = await db.pushSubscription.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (all.length > MAX_PER_USER) await db.pushSubscription.deleteMany({ where: { id: { in: all.slice(MAX_PER_USER).map((s) => s.id) } } });
}

export async function removeSubscription(userId: string, endpoint: string) {
  await db.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

/** Sends to every subscription of the given users. Expired subscriptions are removed. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (!isPushConfigured() || userIds.length === 0) return 0;
  const subs = await db.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  const safe: PushPayload = {
    title: payload.title.slice(0, 120),
    body: payload.body?.slice(0, 160),
    link: payload.link && payload.link.startsWith("/") && !payload.link.startsWith("//") ? payload.link : "/app/notifications",
    tag: payload.tag,
  };
  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        const r = await getPushSender().send(s, safe);
        if (r.ok) {
          delivered++;
          await db.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date(), failureCount: 0 } });
        } else if (r.gone || s.failureCount + 1 >= 5) {
          await db.pushSubscription.deleteMany({ where: { id: s.id } });
        } else {
          await db.pushSubscription.update({ where: { id: s.id }, data: { failureCount: { increment: 1 } } });
        }
      } catch (e) {
        log.warn("push.send_failed", errorMeta(e));
      }
    }),
  );
  return delivered;
}
