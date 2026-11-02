import type { DonationStatus } from "@prisma/client";
import { Badge, type Tone } from "./ui/badge";

const MAP: Record<DonationStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending confirmation", tone: "warning" },
  SUCCEEDED: { label: "Confirmed", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  ABANDONED: { label: "Not completed", tone: "neutral" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
  PARTIALLY_REFUNDED: { label: "Partially refunded", tone: "gold" },
  DISPUTED: { label: "Disputed", tone: "danger" },
};

export function DonationStatusBadge({ status }: { status: DonationStatus }) {
  const s = MAP[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
