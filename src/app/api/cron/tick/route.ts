import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { safeEqual } from "@/server/crypto";
import { runScheduledTick } from "@/server/jobs/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request) {
  const secret = env.cronSecret;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runScheduledTick());
}

export const GET = handle; // Vercel Cron issues GET requests
export const POST = handle;
