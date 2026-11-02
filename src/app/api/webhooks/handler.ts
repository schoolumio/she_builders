import "server-only";
import { NextResponse } from "next/server";
import type { PaymentProviderId } from "@prisma/client";
import { getPaymentProvider } from "@/server/payments/providers";
import { processPaymentEvent } from "@/server/payments/events";
import { WebhookSignatureError } from "@/server/payments/types";
import { errorMeta, log } from "@/server/log";

/** Shared payment webhook handler: raw body → signature check → idempotent processing. */
export async function handlePaymentWebhook(provider: PaymentProviderId, req: Request) {
  const raw = await req.text();
  if (raw.length > 512_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let ev;
  try {
    ev = await getPaymentProvider(provider).parseWebhook(raw, req.headers);
  } catch (e) {
    if (e instanceof WebhookSignatureError) {
      log.warn("webhook.invalid_signature", { provider });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    log.error("webhook.parse_failed", { provider, ...errorMeta(e) });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  try {
    const outcome = await processPaymentEvent(provider, ev);
    return NextResponse.json({ received: true, outcome });
  } catch (e) {
    // Non-2xx makes the provider retry; processing is idempotent.
    log.error("webhook.processing_failed", { provider, eventId: ev.eventId, ...errorMeta(e) });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
