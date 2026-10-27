import type { ParticipantPermissions, RealtimeProvider, RealtimeWebhookEvent, TokenRequest } from "@/server/realtime/provider";

/** In-memory realtime provider for tests. Records every call. */
export class FakeRealtimeProvider implements RealtimeProvider {
  readonly name = "fake";
  configured = true;
  tokens: TokenRequest[] = [];
  calls: { method: string; args: unknown[] }[] = [];
  isConfigured() {
    return this.configured;
  }
  clientUrl() {
    return "wss://fake.livekit.test";
  }
  async createAccessToken(req: TokenRequest) {
    this.tokens.push(req);
    return `token-for-${req.identity}`;
  }
  async ensureRoom(roomName: string, opts: object) {
    this.calls.push({ method: "ensureRoom", args: [roomName, opts] });
  }
  async updateParticipant(roomName: string, identity: string, update: { permissions?: ParticipantPermissions; attributes?: Record<string, string> }) {
    this.calls.push({ method: "updateParticipant", args: [roomName, identity, update] });
  }
  async muteMicrophone(roomName: string, identity: string) {
    this.calls.push({ method: "muteMicrophone", args: [roomName, identity] });
  }
  async removeParticipant(roomName: string, identity: string) {
    this.calls.push({ method: "removeParticipant", args: [roomName, identity] });
  }
  async sendServerData(roomName: string, topic: string, payload: unknown) {
    this.calls.push({ method: "sendServerData", args: [roomName, topic, payload] });
  }
  async closeRoom(roomName: string) {
    this.calls.push({ method: "closeRoom", args: [roomName] });
  }
  async verifyWebhook(rawBody: string, authHeader: string | null): Promise<RealtimeWebhookEvent> {
    if (authHeader !== "valid") throw new Error("invalid signature");
    return JSON.parse(rawBody);
  }
}
