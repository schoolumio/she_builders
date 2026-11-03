import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/current-user";
import { assertSameOrigin, jsonError } from "@/server/http";
import { sendPushToUsers } from "@/server/push";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** Sends a test notification to the signed-in user's own browsers. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await rateLimit(`push:test:${user.id}`, 5, 300);
    const delivered = await sendPushToUsers([user.id], { title: "Notifications are working", body: "You'll receive meeting reminders and updates here.", link: "/app/notifications", tag: "test" });
    return NextResponse.json({ delivered });
  } catch (e) {
    return jsonError(e);
  }
}
