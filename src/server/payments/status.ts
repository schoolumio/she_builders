import type { ConnectionStatus, DonationStatus } from "@prisma/client";
import type { AccountSnapshot, ProviderCapabilities } from "./types";

/**
 * Derives the connection state from the provider snapshot plus BridgeCodes review (where the
 * provider requires it). A connection is VERIFIED only when the provider itself reports that the
 * account can accept charges.
 */
export function deriveConnectionStatus(
  snapshot: AccountSnapshot,
  caps: Pick<ProviderCapabilities, "requiresPlatformReview">,
  platformReviewed: boolean,
): ConnectionStatus {
  switch (snapshot.providerStatus) {
    case "onboarding_required":
      return "ONBOARDING_REQUIRED";
    case "restricted":
      return "RESTRICTED";
    case "pending":
      return "PENDING_VERIFICATION";
    case "verified":
      if (!snapshot.chargesEnabled) return "PENDING_VERIFICATION";
      if (caps.requiresPlatformReview && !platformReviewed) return "PENDING_VERIFICATION";
      return "VERIFIED";
  }
}

/** Allowed donation state transitions. Anything else is ignored (and logged) by the event processor. */
const TRANSITIONS: Record<DonationStatus, DonationStatus[]> = {
  PENDING: ["SUCCEEDED", "FAILED", "ABANDONED"],
  ABANDONED: ["SUCCEEDED", "FAILED"],
  FAILED: ["SUCCEEDED"], // providers occasionally confirm a late success after a failed attempt
  SUCCEEDED: ["PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"],
  PARTIALLY_REFUNDED: ["PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"],
  DISPUTED: ["SUCCEEDED", "REFUNDED", "PARTIALLY_REFUNDED"],
  REFUNDED: [],
};

export function canTransition(from: DonationStatus, to: DonationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export const CONNECTION_STATUS_COPY: Record<ConnectionStatus, { label: string; tone: "neutral" | "warning" | "success" | "danger"; help: string }> = {
  NOT_CONFIGURED: { label: "Not configured", tone: "neutral", help: "No payment account has been connected." },
  ONBOARDING_REQUIRED: { label: "Onboarding required", tone: "warning", help: "Complete the provider's onboarding to continue." },
  PENDING_VERIFICATION: { label: "Pending verification", tone: "warning", help: "The provider (and, where required, BridgeCodes) is reviewing this account. Donations are not yet accepted." },
  VERIFIED: { label: "Verified", tone: "success", help: "The provider has confirmed this account can accept donations." },
  RESTRICTED: { label: "Restricted", tone: "danger", help: "The provider has restricted this account. Resolve the outstanding requirements with the provider." },
  DISCONNECTED: { label: "Disconnected", tone: "neutral", help: "This account was disconnected and cannot accept donations." },
};
