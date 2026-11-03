import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { assertSameOrigin, jsonError } from "@/server/http";
import { removeSubscription, saveSubscription } from "@/server/push";
import { parseInput } from "@/server/validate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await saveSubscription(user.id, await req.json().catch(() => ({})), req.headers.get("user-agent"));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { endpoint } = parseInput(z.object({ endpoint: z.string().max(1000) }), await req.json().catch(() => ({})));
    await removeSubscription(user.id, endpoint);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
