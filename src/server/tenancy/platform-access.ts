import "server-only";
import { ForbiddenError } from "../errors";
import { platformMfaRequired } from "../auth/mfa";
import type { Actor } from "./context";

/** Platform staff checks. When required (production default), staff must have two-factor enabled. */
function assertMfa(actor: Actor) {
  if (platformMfaRequired() && !actor.mfaEnabledAt) {
    throw new ForbiddenError("Turn on two-factor authentication in Account security to use platform administration.");
  }
}

export function requirePlatformStaff(actor: Actor) {
  if (!actor.platformRole) throw new ForbiddenError();
  assertMfa(actor);
}

export function requirePlatformSuper(actor: Actor) {
  if (actor.platformRole !== "SUPER_ADMIN") throw new ForbiddenError();
  assertMfa(actor);
}
