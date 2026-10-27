import "server-only";
import { z } from "zod";
import { db } from "../db";
import { AppError, NotFoundError, ValidationError } from "../errors";
import { parseInput } from "../validate";
import { audit } from "../audit";
import { rateLimit } from "../rate-limit";
import { randomToken } from "../crypto";
import { assertFeature, getEntitlements } from "../billing/entitlements";
import type { OrgContext } from "../tenancy/context";
import { requireActiveOrg, requirePermission } from "../tenancy/context";
import { getRealtimeProvider } from "../realtime";
import { getOccurrenceForMember } from "../meetings/service";
import { donationReadiness } from "../payments/connections";
import { checkbox, currencySchema } from "@/lib/validation";
import { platformFee, toMinorUnits } from "@/lib/money";

const giftSchema = z
  .object({
    name: z.string().trim().min(2).max(40),
    emoji: z.string().trim().min(1).max(8),
    position: z.coerce.number().int().min(0).max(100).default(0),
    available: checkbox,
    showInFeed: checkbox,
    paid: checkbox,
    price: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : undefined)),
    currency: currencySchema.optional().or(z.literal("").transform(() => undefined)),
  })
  .refine((d) => !d.paid || (d.price && d.price > 0 && d.currency), { path: ["price"], error: "Paid gifts need a price and currency." });

export async function saveGift(ctx: OrgContext, input: unknown, id?: string) {
  requirePermission(ctx, "gifts.manage");
  requireActiveOrg(ctx);
  const d = parseInput(giftSchema, input);
  if (d.paid) await assertFeature(ctx.org.id, "feature.paid_gifts");
  const data = {
    name: d.name,
    emoji: d.emoji,
    position: d.position,
    available: d.available,
    showInFeed: d.showInFeed,
    priceAmount: d.paid ? toMinorUnits(d.price!, d.currency!) : null,
    currency: d.paid ? d.currency! : null,
  };
  if (id) {
    const res = await db.virtualGift.updateMany({ where: { id, organizationId: ctx.org.id }, data });
    if (!res.count) throw new NotFoundError("Gift not found.");
  } else {
    await db.virtualGift.create({ data: { ...data, organizationId: ctx.org.id } });
  }
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: id ? "gift.updated" : "gift.created", metadata: { name: d.name, paid: d.paid } });
}

export async function deleteGift(ctx: OrgContext, id: string) {
  requirePermission(ctx, "gifts.manage");
  const res = await db.virtualGift.updateMany({ where: { id, organizationId: ctx.org.id }, data: { available: false } });
  if (!res.count) throw new NotFoundError("Gift not found.");
}

export async function setPaidGiftsEnabled(ctx: OrgContext, enabled: boolean) {
  requirePermission(ctx, "gifts.manage");
  if (enabled) await assertFeature(ctx.org.id, "feature.paid_gifts");
  await db.organization.update({ where: { id: ctx.org.id }, data: { paidGiftsEnabled: enabled } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: enabled ? "gift.paid_enabled" : "gift.paid_disabled" });
}

export async function listGifts(organizationId: string, opts: { includeUnavailable?: boolean } = {}) {
  return db.virtualGift.findMany({
    where: { organizationId, ...(opts.includeUnavailable ? {} : { available: true }) },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
}

async function loadGiftContext(ctx: OrgContext, occurrenceId: string, giftId: string) {
  const { occurrence } = await getOccurrenceForMember(ctx, occurrenceId);
  if (!occurrence.meeting.giftsEnabled || occurrence.meeting.mode === "WHATSAPP") throw new ValidationError("Gifts are not enabled for this meeting.");
  if (occurrence.status === "CANCELLED" || occurrence.status === "ENDED") throw new ValidationError("This session is not live.");
  const gift = await db.virtualGift.findFirst({ where: { id: giftId, organizationId: ctx.org.id, available: true } });
  if (!gift) throw new NotFoundError("Gift not found.");
  return { occurrence, gift };
}

function feedPayload(gift: { name: string; emoji: string }, senderName: string | null, eventId: string) {
  return { type: "gift", id: eventId, gift: { name: gift.name, emoji: gift.emoji }, sender: senderName ?? "Someone" };
}

/** Free gifts are recorded and broadcast by the server, so clients cannot forge gift events. */
export async function sendFreeGift(ctx: OrgContext, occurrenceId: string, giftId: string, showName: boolean) {
  const { occurrence, gift } = await loadGiftContext(ctx, occurrenceId, giftId);
  if (gift.priceAmount) throw new ValidationError("This gift requires payment.");
  await rateLimit(`gift:${occurrence.id}:${ctx.actor.id}`, 10, 60);
  const ev = await db.giftEvent.create({
    data: { organizationId: ctx.org.id, occurrenceId: occurrence.id, giftId: gift.id, senderId: ctx.actor.id, showSenderName: showName },
  });
  if (gift.showInFeed) await getRealtimeProvider().sendServerData(occurrence.roomName, "gift", feedPayload(gift, showName ? ctx.actor.name : null, ev.id)).catch(() => undefined);
  return ev;
}

/** Paid gifts go through the organisation's verified provider and are recorded as purpose=GIFT, never as donations. */
export async function startPaidGift(ctx: OrgContext, occurrenceId: string, giftId: string, showName: boolean) {
  const { occurrence, gift } = await loadGiftContext(ctx, occurrenceId, giftId);
  if (!gift.priceAmount || !gift.currency) throw new ValidationError("This gift is free.");
  if (!ctx.org.paidGiftsEnabled) throw new AppError("Paid gifts are not enabled for this community.");
  const ent = await assertFeature(ctx.org.id, "feature.paid_gifts");
  await rateLimit(`paid-gift:${ctx.actor.id}`, 10, 3600);
  const readiness = await donationReadiness(ctx.org.id, gift.currency);
  if (!readiness.ready) throw new AppError(readiness.reason);
  // Re-use an in-progress purchase of the same gift to avoid duplicate charges from double clicks.
  const recent = await db.donation.findFirst({
    where: { purpose: "GIFT", donorUserId: ctx.actor.id, giftId: gift.id, occurrenceId: occurrence.id, status: "PENDING", createdAt: { gt: new Date(Date.now() - 15 * 60_000) } },
  });
  if (recent) return { reference: recent.reference };
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.actor.id }, select: { email: true, name: true } });
  const d = await db.donation.create({
    data: {
      organizationId: ctx.org.id,
      connectionId: readiness.connection.id,
      provider: readiness.connection.provider,
      purpose: "GIFT",
      donorUserId: ctx.actor.id,
      donorName: user.name,
      donorEmail: user.email,
      anonymous: !showName,
      reference: `gift_${randomToken(18)}`,
      currency: gift.currency,
      amount: gift.priceAmount,
      platformFeeAmount: platformFee(gift.priceAmount, (ent ?? (await getEntitlements(ctx.org.id))).plan.platformFeeBps),
      giftId: gift.id,
      occurrenceId: occurrence.id,
    },
  });
  return { reference: d.reference };
}

/** Called once the provider confirms payment for a GIFT. Idempotent via GiftEvent.donationId UNIQUE. */
export async function completePaidGift(donationId: string) {
  const d = await db.donation.findUniqueOrThrow({ where: { id: donationId } });
  if (d.purpose !== "GIFT" || d.status !== "SUCCEEDED" || !d.giftId || !d.occurrenceId || !d.donorUserId) return;
  const gift = await db.virtualGift.findUnique({ where: { id: d.giftId } });
  const occ = await db.meetingOccurrence.findUnique({ where: { id: d.occurrenceId } });
  if (!gift || !occ) return;
  try {
    const ev = await db.giftEvent.create({
      data: { organizationId: d.organizationId, occurrenceId: occ.id, giftId: gift.id, senderId: d.donorUserId, showSenderName: !d.anonymous, donationId: d.id },
    });
    if (gift.showInFeed) {
      const sender = d.anonymous ? null : d.donorName;
      await getRealtimeProvider().sendServerData(occ.roomName, "gift", feedPayload(gift, sender, ev.id)).catch(() => undefined);
    }
  } catch {
    // Already recorded by an earlier confirmation of the same payment.
  }
}

export async function recentGiftEvents(ctx: OrgContext, occurrenceId: string) {
  const { occurrence } = await getOccurrenceForMember(ctx, occurrenceId);
  const rows = await db.giftEvent.findMany({
    where: { occurrenceId: occurrence.id, gift: { showInFeed: true } },
    include: { gift: true, sender: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return rows.map((r) => feedPayload(r.gift, r.showSenderName ? r.sender.name : null, r.id));
}
