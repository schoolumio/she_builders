import "server-only";
import { db } from "../db";
import { ConfigurationError, ConflictError, EntitlementError, ForbiddenError, ValidationError } from "../errors";
import { audit } from "../audit";
import { rateLimit } from "../rate-limit";
import { getEntitlements, limitOf } from "../billing/entitlements";
import type { OrgContext } from "../tenancy/context";
import { getRealtimeProvider } from "../realtime";
import type { ParticipantPermissions, PublishSource } from "../realtime/provider";
import { getOccurrenceForManage, getOccurrenceForMember, isOccurrenceJoinable, type OccurrenceWithMeeting } from "./service";
import { isMeetingHost } from "./access";

export const ROOM_TOKEN_TTL_SECONDS = 10 * 60;

export type RoomRole = "host" | "speaker" | "listener";

export function roomPermissions(meeting: Pick<OccurrenceWithMeeting["meeting"], "mode" | "format" | "chatEnabled">, role: RoomRole): ParticipantPermissions {
  const media: PublishSource[] = meeting.mode === "VIDEO" ? ["microphone", "camera"] : ["microphone"];
  if (role === "host") {
    return {
      canPublish: true,
      canPublishSources: meeting.mode === "VIDEO" ? [...media, "screen_share", "screen_share_audio"] : media,
      canSubscribe: true,
      canPublishData: true,
    };
  }
  const canSpeak = role === "speaker";
  return { canPublish: canSpeak, canPublishSources: canSpeak ? media : [], canSubscribe: true, canPublishData: meeting.chatEnabled };
}

async function resolveRole(occ: OccurrenceWithMeeting, userId: string, canManage: boolean): Promise<RoomRole> {
  if (canManage) return "host";
  const state = await db.meetingParticipantState.findUnique({ where: { occurrenceId_userId: { occurrenceId: occ.id, userId } } });
  // Interactive rooms let everyone speak unless a host revoked it; broadcasts require an explicit grant.
  if (occ.meeting.format === "INTERACTIVE") return state?.speakingRevoked ? "listener" : "speaker";
  return state?.canSpeak ? "speaker" : "listener";
}

export type JoinResult =
  | { status: "ok"; token: string; url: string; identity: string; role: RoomRole }
  | { status: "waiting" }
  | { status: "denied"; reason: string };

/**
 * Issues a short-lived room token after checking membership, meeting visibility, meeting mode,
 * schedule window, lock, bans, waiting-room admission and plan limits.
 */
export async function issueRoomToken(ctx: OrgContext, occurrenceId: string, now = new Date()): Promise<JoinResult> {
  const { occurrence: occ, canManage } = await getOccurrenceForMember(ctx, occurrenceId);
  if (occ.meeting.mode === "WHATSAPP") throw new ValidationError("This meeting takes place on WhatsApp.");
  if (occ.meeting.status !== "ACTIVE" || occ.status === "CANCELLED") return { status: "denied", reason: "This session has been cancelled." };
  if (occ.status === "ENDED") return { status: "denied", reason: "This session has ended." };
  if (!isOccurrenceJoinable(occ, now, canManage ? 30 : 15)) return { status: "denied", reason: "This session is not open yet. You can join up to 15 minutes before it starts." };

  const provider = getRealtimeProvider();
  if (!provider.isConfigured()) throw new ConfigurationError("In-app meetings are not configured for this platform yet.");

  const ent = await getEntitlements(ctx.org.id);
  const feature = occ.meeting.mode === "VIDEO" ? "feature.in_app_video" : "feature.in_app_audio";
  if (!ent.features.has(feature)) throw new EntitlementError("In-app meetings are not included in this community's current plan.");
  const planLimit = limitOf(ent, "limit.room_participants");
  if (planLimit === 0) throw new EntitlementError("In-app meetings are not included in this community's current plan.");

  if (await db.meetingRoomBan.findUnique({ where: { occurrenceId_userId: { occurrenceId: occ.id, userId: ctx.actor.id } } })) {
    return { status: "denied", reason: "A host removed you from this session." };
  }
  if (!canManage && occ.locked) return { status: "denied", reason: "The host has locked this session." };

  if (!canManage && occ.meeting.waitingRoom) {
    const admission = await db.meetingAdmission.upsert({
      where: { occurrenceId_userId: { occurrenceId: occ.id, userId: ctx.actor.id } },
      create: { occurrenceId: occ.id, userId: ctx.actor.id },
      update: {},
    });
    if (admission.status === "PENDING") return { status: "waiting" };
    if (admission.status === "DENIED") return { status: "denied", reason: "The host did not admit you to this session." };
  }

  await rateLimit(`room-token:${ctx.actor.id}`, 30, 300);
  const role = await resolveRole(occ, ctx.actor.id, canManage);
  const maxParticipants = Math.min(...[planLimit, occ.meeting.maxParticipants].filter((n): n is number => typeof n === "number" && n > 0));
  await provider.ensureRoom(occ.roomName, { maxParticipants: Number.isFinite(maxParticipants) ? maxParticipants : undefined });
  const token = await provider.createAccessToken({
    roomName: occ.roomName,
    identity: ctx.actor.id,
    name: ctx.actor.name,
    permissions: roomPermissions(occ.meeting, role),
    attributes: { role, hand: "" },
    ttlSeconds: ROOM_TOKEN_TTL_SECONDS,
  });
  return { status: "ok", token, url: provider.clientUrl(), identity: ctx.actor.id, role };
}

export async function setHand(ctx: OrgContext, occurrenceId: string, raised: boolean) {
  const { occurrence: occ } = await getOccurrenceForMember(ctx, occurrenceId);
  await rateLimit(`hand:${ctx.actor.id}`, 30, 60);
  await db.meetingParticipantState.upsert({
    where: { occurrenceId_userId: { occurrenceId: occ.id, userId: ctx.actor.id } },
    create: { occurrenceId: occ.id, userId: ctx.actor.id, handRaisedAt: raised ? new Date() : null },
    update: { handRaisedAt: raised ? new Date() : null },
  });
  await getRealtimeProvider().updateParticipant(occ.roomName, ctx.actor.id, { attributes: { hand: raised ? String(Date.now()) : "" } });
}

export type HostAction = "mute" | "allow_speak" | "revoke_speak" | "remove" | "admit" | "deny" | "lower_hand";

export async function hostParticipantAction(ctx: OrgContext, occurrenceId: string, action: HostAction, targetUserId: string) {
  const occ = await getOccurrenceForManage(ctx, occurrenceId);
  if (targetUserId === ctx.actor.id && (action === "remove" || action === "deny")) throw new ValidationError("You cannot remove yourself.");
  if (isMeetingHost(occ.meeting, targetUserId) && action === "remove") throw new ForbiddenError("Hosts cannot be removed from their own meeting.");
  const provider = getRealtimeProvider();
  const room = occ.roomName;

  switch (action) {
    case "mute":
      await provider.muteMicrophone(room, targetUserId);
      break;
    case "allow_speak":
    case "revoke_speak": {
      const canSpeak = action === "allow_speak";
      await db.meetingParticipantState.upsert({
        where: { occurrenceId_userId: { occurrenceId: occ.id, userId: targetUserId } },
        create: { occurrenceId: occ.id, userId: targetUserId, canSpeak, speakingRevoked: !canSpeak, handRaisedAt: null },
        update: { canSpeak, speakingRevoked: !canSpeak, handRaisedAt: null },
      });
      if (!canSpeak) await provider.muteMicrophone(room, targetUserId);
      await provider.updateParticipant(room, targetUserId, {
        permissions: roomPermissions(occ.meeting, canSpeak ? "speaker" : "listener"),
        attributes: { role: canSpeak ? "speaker" : "listener", hand: "" },
      });
      await audit({
        organizationId: ctx.org.id,
        actorId: ctx.actor.id,
        action: canSpeak ? "meeting.speak_granted" : "meeting.speak_revoked",
        targetType: "MeetingOccurrence",
        targetId: occ.id,
        metadata: { userId: targetUserId },
      });
      break;
    }
    case "lower_hand":
      await db.meetingParticipantState.updateMany({ where: { occurrenceId: occ.id, userId: targetUserId }, data: { handRaisedAt: null } });
      await provider.updateParticipant(room, targetUserId, { attributes: { hand: "" } });
      break;
    case "remove":
      await db.meetingRoomBan.upsert({
        where: { occurrenceId_userId: { occurrenceId: occ.id, userId: targetUserId } },
        create: { occurrenceId: occ.id, userId: targetUserId, bannedById: ctx.actor.id },
        update: {},
      });
      await provider.removeParticipant(room, targetUserId);
      await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "meeting.participant_removed", targetType: "MeetingOccurrence", targetId: occ.id, metadata: { userId: targetUserId } });
      break;
    case "admit":
    case "deny": {
      const res = await db.meetingAdmission.updateMany({
        where: { occurrenceId: occ.id, userId: targetUserId },
        data: { status: action === "admit" ? "ADMITTED" : "DENIED", decidedById: ctx.actor.id },
      });
      if (!res.count) throw new ConflictError("That person is not waiting to join.");
      break;
    }
  }
}

export async function setRoomLock(ctx: OrgContext, occurrenceId: string, locked: boolean) {
  const occ = await getOccurrenceForManage(ctx, occurrenceId);
  await db.meetingOccurrence.update({ where: { id: occ.id }, data: { locked } });
  await getRealtimeProvider().sendServerData(occ.roomName, "system", { type: "lock", locked });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: locked ? "meeting.locked" : "meeting.unlocked", targetType: "MeetingOccurrence", targetId: occ.id });
}

export async function endRoom(ctx: OrgContext, occurrenceId: string) {
  const occ = await getOccurrenceForManage(ctx, occurrenceId);
  await getRealtimeProvider().closeRoom(occ.roomName);
  await db.meetingOccurrence.update({ where: { id: occ.id }, data: { status: "ENDED", liveEndedAt: new Date() } });
  await closeOpenAttendance(occ.id, new Date());
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "meeting.ended", targetType: "MeetingOccurrence", targetId: occ.id });
}

/** Host view of the room: waiting list, raised hands, speakers. */
export async function getRoomControlState(ctx: OrgContext, occurrenceId: string) {
  const occ = await getOccurrenceForManage(ctx, occurrenceId);
  const [waiting, states] = await Promise.all([
    db.meetingAdmission.findMany({ where: { occurrenceId: occ.id, status: "PENDING" }, include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
    db.meetingParticipantState.findMany({ where: { occurrenceId: occ.id } }),
  ]);
  return {
    locked: occ.locked,
    waiting: waiting.map((w) => ({ userId: w.user.id, name: w.user.name })),
    speakers: states.filter((s) => s.canSpeak).map((s) => s.userId),
    hands: states.filter((s) => s.handRaisedAt).map((s) => ({ userId: s.userId, at: s.handRaisedAt })),
  };
}

export async function getAdmissionStatus(ctx: OrgContext, occurrenceId: string) {
  const row = await db.meetingAdmission.findUnique({ where: { occurrenceId_userId: { occurrenceId, userId: ctx.actor.id } } });
  return row?.status ?? null;
}

// ---------------------------------------------------------------------------------------------
// Provider webhooks → attendance (the only automatic attendance source)
// ---------------------------------------------------------------------------------------------

async function closeOpenAttendance(occurrenceId: string, at: Date) {
  const open = await db.meetingAttendance.findMany({ where: { occurrenceId, activeSessionStartedAt: { not: null } } });
  for (const a of open) {
    const secs = Math.max(0, Math.round((at.getTime() - a.activeSessionStartedAt!.getTime()) / 1000));
    await db.meetingAttendance.update({ where: { id: a.id }, data: { totalSeconds: { increment: secs }, lastLeftAt: at, activeSessionStartedAt: null } });
    await addUsage(a.organizationId, "meeting.participant_minutes", Math.ceil(secs / 60), at);
  }
}

async function addUsage(organizationId: string, metric: string, quantity: number, at: Date) {
  if (quantity <= 0) return;
  const period = at.toISOString().slice(0, 7);
  await db.usageRecord.upsert({
    where: { organizationId_metric_period: { organizationId, metric, period } },
    create: { organizationId, metric, period, quantity },
    update: { quantity: { increment: quantity } },
  });
}

export async function handleRealtimeEvent(ev: import("../realtime/provider").RealtimeWebhookEvent, providerName: string) {
  try {
    await db.realtimeWebhookEvent.create({ data: { provider: providerName, eventId: ev.id, type: ev.type } });
  } catch {
    return "duplicate";
  }
  if (!ev.roomName) return "ignored";
  const occ = await db.meetingOccurrence.findUnique({ where: { roomName: ev.roomName } });
  if (!occ) return "unknown_room";

  switch (ev.type) {
    case "room_started":
      await db.meetingOccurrence.update({ where: { id: occ.id }, data: { status: "LIVE", liveStartedAt: occ.liveStartedAt ?? ev.at } });
      return "ok";
    case "room_finished":
      await closeOpenAttendance(occ.id, ev.at);
      await db.meetingOccurrence.update({ where: { id: occ.id }, data: { status: occ.status === "CANCELLED" ? "CANCELLED" : "ENDED", liveEndedAt: ev.at } });
      return "ok";
    case "participant_joined":
    case "participant_left": {
      if (!ev.identity) return "ignored";
      const member = await db.membership.findUnique({ where: { organizationId_userId: { organizationId: occ.organizationId, userId: ev.identity } } });
      if (!member) return "not_member";
      const existing = await db.meetingAttendance.findUnique({ where: { occurrenceId_userId: { occurrenceId: occ.id, userId: ev.identity } } });
      if (ev.type === "participant_joined") {
        if (!existing) {
          await db.meetingAttendance.create({
            data: { organizationId: occ.organizationId, occurrenceId: occ.id, userId: ev.identity, source: "PROVIDER_WEBHOOK", firstJoinedAt: ev.at, activeSessionStartedAt: ev.at },
          });
        } else if (!existing.activeSessionStartedAt) {
          await db.meetingAttendance.update({ where: { id: existing.id }, data: { activeSessionStartedAt: ev.at, source: "PROVIDER_WEBHOOK" } });
        }
      } else if (existing?.activeSessionStartedAt) {
        const secs = Math.max(0, Math.round((ev.at.getTime() - existing.activeSessionStartedAt.getTime()) / 1000));
        await db.meetingAttendance.update({ where: { id: existing.id }, data: { totalSeconds: { increment: secs }, lastLeftAt: ev.at, activeSessionStartedAt: null } });
        await addUsage(occ.organizationId, "meeting.participant_minutes", Math.ceil(secs / 60), ev.at);
      }
      return "ok";
    }
    default:
      return "ignored";
  }
}
