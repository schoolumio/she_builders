import { NextResponse } from "next/server";
import { simulatorAllowed } from "@/server/payments/providers/simulator";
import { handlePaymentWebhook } from "../handler";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!simulatorAllowed()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return handlePaymentWebhook("SIMULATOR", req);
}
