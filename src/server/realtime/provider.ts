import "server-only";

export type PublishSource = "microphone" | "camera" | "screen_share" | "screen_share_audio";

export type ParticipantPermissions = {
  canPublish: boolean;
  canPublishSources: PublishSource[];
  canSubscribe: boolean;
  canPublishData: boolean;
};

export type TokenRequest = {
  roomName: string;
  identity: string;
  name: string;
  permissions: ParticipantPermissions;
  attributes?: Record<string, string>;
  ttlSeconds: number;
};

export type RealtimeWebhookEvent = {
  id: string;
  type: "room_started" | "room_finished" | "participant_joined" | "participant_left" | "other";
  roomName?: string;
  identity?: string;
  at: Date;
};

/**
 * Provider-neutral interface for real-time rooms. The meeting system only talks to this
 * interface, so LiveKit can be swapped for another SFU without touching meeting logic.
 * All methods run on the server; provider secrets never reach the browser.
 */
export interface RealtimeProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** WebSocket URL the browser SDK connects to. */
  clientUrl(): string;
  createAccessToken(req: TokenRequest): Promise<string>;
  ensureRoom(roomName: string, opts: { maxParticipants?: number; emptyTimeoutSeconds?: number }): Promise<void>;
  updateParticipant(roomName: string, identity: string, update: { permissions?: ParticipantPermissions; attributes?: Record<string, string> }): Promise<void>;
  muteMicrophone(roomName: string, identity: string): Promise<void>;
  removeParticipant(roomName: string, identity: string): Promise<void>;
  /** Server-authored data message. Clients trust gift/system events only from the server. */
  sendServerData(roomName: string, topic: string, payload: unknown): Promise<void>;
  closeRoom(roomName: string): Promise<void>;
  /** Verifies the provider signature and normalises the event. Throws on invalid signatures. */
  verifyWebhook(rawBody: string, authHeader: string | null): Promise<RealtimeWebhookEvent>;
}

export class RealtimeNotConfiguredError extends Error {
  constructor() {
    super("In-app meetings are not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.");
  }
}
