import { NextResponse } from "next/server";
import { getRealtimeProvider } from "@/server/realtime";
import { handleRealtimeEvent } from "@/server/meetings/room";
import { errorMeta, log } from "@/server/log";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const provider = getRealtimeProvider();
  const raw = await req.text();
  let ev;
  try {
    ev = await provider.verifyWebhook(raw, req.headers.get("authorization"));
  } catch {
    log.warn("realtime.webhook_invalid");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  try {
    const outcome = await handleRealtimeEvent(ev, provider.name);
    return NextResponse.json({ received: true, outcome });
  } catch (e) {
    log.error("realtime.webhook_failed", errorMeta(e));
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
