import "server-only";
import type { RealtimeProvider } from "./provider";
import { LiveKitProvider } from "./livekit";

let provider: RealtimeProvider | undefined;

export function getRealtimeProvider(): RealtimeProvider {
  provider ??= new LiveKitProvider();
  return provider;
}

/** Test hook: swap in a fake provider. */
export function setRealtimeProvider(p: RealtimeProvider | undefined) {
  provider = p;
}
