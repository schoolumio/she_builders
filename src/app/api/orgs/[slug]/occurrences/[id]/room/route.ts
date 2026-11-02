import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { getOrgContext } from "@/server/tenancy/context";
import { UnauthenticatedError } from "@/server/errors";
import { assertSameOrigin, jsonError } from "@/server/http";
import { parseInput } from "@/server/validate";
import { endRoom, getRoomControlState, hostParticipantAction, issueRoomToken, setHand, setRoomLock } from "@/server/meetings/room";
import { recentGiftEvents, sendFreeGift, startPaidGift } from "@/server/gifts/service";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("token") }),
  z.object({ op: z.literal("hand"), raised: z.boolean() }),
  z.object({ op: z.literal("control"), action: z.enum(["mute", "allow_speak", "revoke_speak", "remove", "admit", "deny", "lower_hand"]), userId: z.string().min(1).max(40) }),
  z.object({ op: z.literal("lock"), locked: z.boolean() }),
  z.object({ op: z.literal("end") }),
  z.object({ op: z.literal("gift"), giftId: z.string().min(1).max(40), showName: z.boolean(), paid: z.boolean().optional() }),
]);

async function context(slug: string) {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return getOrgContext(user, { slug });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    assertSameOrigin(req);
    const { slug, id } = await params;
    const ctx = await context(slug);
    const body = parseInput(bodySchema, await req.json().catch(() => ({})));
    switch (body.op) {
      case "token":
        return NextResponse.json(await issueRoomToken(ctx, id), { headers: { "Cache-Control": "no-store" } });
      case "hand":
        await setHand(ctx, id, body.raised);
        return NextResponse.json({ ok: true });
      case "control":
        await hostParticipantAction(ctx, id, body.action, body.userId);
        return NextResponse.json({ ok: true });
      case "lock":
        await setRoomLock(ctx, id, body.locked);
        return NextResponse.json({ ok: true });
      case "end":
        await endRoom(ctx, id);
        return NextResponse.json({ ok: true });
      case "gift":
        if (body.paid) return NextResponse.json({ ok: true, checkout: `/donations/${(await startPaidGift(ctx, id, body.giftId, body.showName)).reference}` });
        await sendFreeGift(ctx, id, body.giftId, body.showName);
        return NextResponse.json({ ok: true });
    }
  } catch (e) {
    return jsonError(e);
  }
}

/** Host control state (waiting list, hands) or recent gift feed. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const { slug, id } = await params;
    const ctx = await context(slug);
    const what = new URL(req.url).searchParams.get("what");
    if (what === "gifts") return NextResponse.json({ gifts: await recentGiftEvents(ctx, id) });
    return NextResponse.json(await getRoomControlState(ctx, id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}
