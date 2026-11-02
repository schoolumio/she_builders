import { NextResponse } from "next/server";
import { handleBillingWebhook } from "@/server/billing/service";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const outcome = await handleBillingWebhook(await req.text(), req.headers.get("stripe-signature"));
    return NextResponse.json({ received: true, outcome });
  } catch (e) {
    return jsonError(e);
  }
}
