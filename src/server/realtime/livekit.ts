import "server-only";
import { AccessToken, DataPacket_Kind, RoomServiceClient, TrackSource, TrackType, WebhookReceiver } from "livekit-server-sdk";
import type { ParticipantPermissions, PublishSource, RealtimeProvider, RealtimeWebhookEvent, TokenRequest } from "./provider";
import { RealtimeNotConfiguredError } from "./provider";

const SOURCE_MAP: Record<PublishSource, TrackSource> = {
  microphone: TrackSource.MICROPHONE,
  camera: TrackSource.CAMERA,
  screen_share: TrackSource.SCREEN_SHARE,
  screen_share_audio: TrackSource.SCREEN_SHARE_AUDIO,
};

function toLkPermission(p: ParticipantPermissions) {
  return {
    canPublish: p.canPublish,
    canSubscribe: p.canSubscribe,
    canPublishData: p.canPublishData,
    canPublishSources: p.canPublishSources.map((s) => SOURCE_MAP[s]),
    canUpdateMetadata: false,
  };
}

export class LiveKitProvider implements RealtimeProvider {
  readonly name = "livekit";
  private url = process.env.LIVEKIT_URL ?? "";
  private key = process.env.LIVEKIT_API_KEY ?? "";
  private secret = process.env.LIVEKIT_API_SECRET ?? "";
  private client?: RoomServiceClient;

  isConfigured() {
    return !!(this.url && this.key && this.secret);
  }

  clientUrl() {
    return this.url;
  }

  private svc() {
    if (!this.isConfigured()) throw new RealtimeNotConfiguredError();
    this.client ??= new RoomServiceClient(this.url.replace(/^ws/, "http"), this.key, this.secret);
    return this.client;
  }

  async createAccessToken(req: TokenRequest) {
    if (!this.isConfigured()) throw new RealtimeNotConfiguredError();
    const at = new AccessToken(this.key, this.secret, { identity: req.identity, name: req.name, ttl: req.ttlSeconds, attributes: req.attributes });
    at.addGrant({
      roomJoin: true,
      room: req.roomName,
      canPublish: req.permissions.canPublish,
      canSubscribe: req.permissions.canSubscribe,
      canPublishData: req.permissions.canPublishData,
      canPublishSources: req.permissions.canPublishSources.map((s) => SOURCE_MAP[s]),
      canUpdateOwnMetadata: false,
    });
    return at.toJwt();
  }

  async ensureRoom(roomName: string, opts: { maxParticipants?: number; emptyTimeoutSeconds?: number }) {
    // createRoom returns the existing room if it already exists.
    await this.svc().createRoom({ name: roomName, maxParticipants: opts.maxParticipants ?? 0, emptyTimeout: opts.emptyTimeoutSeconds ?? 600 });
  }

  async updateParticipant(roomName: string, identity: string, update: { permissions?: ParticipantPermissions; attributes?: Record<string, string> }) {
    try {
      await this.svc().updateParticipant(roomName, identity, {
        ...(update.permissions ? { permission: toLkPermission(update.permissions) } : {}),
        ...(update.attributes ? { attributes: update.attributes } : {}),
      });
    } catch (e) {
      if (isNotFound(e)) return; // participant not currently connected
      throw e;
    }
  }

  async muteMicrophone(roomName: string, identity: string) {
    const svc = this.svc();
    let participant;
    try {
      participant = await svc.getParticipant(roomName, identity);
    } catch (e) {
      if (isNotFound(e)) return;
      throw e;
    }
    for (const t of participant.tracks) {
      if (t.type === TrackType.AUDIO && !t.muted) await svc.mutePublishedTrack(roomName, identity, t.sid, true);
    }
  }

  async removeParticipant(roomName: string, identity: string) {
    try {
      // revokeTokenTs invalidates any token issued before now, so the removed user cannot reconnect with it.
      await this.svc().removeParticipant(roomName, identity, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) });
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }

  async sendServerData(roomName: string, topic: string, payload: unknown) {
    const data = new TextEncoder().encode(JSON.stringify(payload));
    try {
      await this.svc().sendData(roomName, data, DataPacket_Kind.RELIABLE, { topic });
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }

  async closeRoom(roomName: string) {
    try {
      await this.svc().deleteRoom(roomName);
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }

  async verifyWebhook(rawBody: string, authHeader: string | null): Promise<RealtimeWebhookEvent> {
    if (!this.isConfigured()) throw new RealtimeNotConfiguredError();
    if (!authHeader) throw new Error("Missing webhook authorization");
    const receiver = new WebhookReceiver(this.key, this.secret);
    const ev = await receiver.receive(rawBody, authHeader);
    const known = ["room_started", "room_finished", "participant_joined", "participant_left"] as const;
    const type = (known as readonly string[]).includes(ev.event) ? (ev.event as RealtimeWebhookEvent["type"]) : "other";
    return {
      id: ev.id,
      type,
      roomName: ev.room?.name,
      identity: ev.participant?.identity,
      at: ev.createdAt ? new Date(Number(ev.createdAt) * 1000) : new Date(),
    };
  }
}

function isNotFound(e: unknown) {
  const err = e as { status?: number; code?: string; message?: string };
  return err?.status === 404 || err?.code === "not_found" || /not.?found|does not exist/i.test(err?.message ?? "");
}
