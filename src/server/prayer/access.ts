import type { PrayerRequest } from "@prisma/client";

export type PrayerViewer = {
  userId: string;
  isCoordinator: boolean; // prayer.view_confidential
  isModerator: boolean; // prayer.moderate
  groupIds: string[];
  assignedRequestIds: Set<string>;
};

type Req = Pick<PrayerRequest, "id" | "authorId" | "visibility" | "groupId" | "moderationStatus">;

/**
 * The single source of truth for who may read a prayer request.
 * See docs/SECURITY.md § "Prayer-request visibility rules".
 */
export function canViewPrayerRequest(req: Req, v: PrayerViewer): boolean {
  if (req.authorId === v.userId) return true;
  if (v.assignedRequestIds.has(req.id)) return true;
  if (req.visibility === "PRIVATE") return v.isCoordinator;
  // Shared requests: moderators and coordinators see them in every moderation state.
  if (v.isCoordinator || v.isModerator) return true;
  if (req.moderationStatus !== "APPROVED") return false;
  if (req.visibility === "GROUP") return !!req.groupId && v.groupIds.includes(req.groupId);
  return true; // ORGANIZATION
}

export function canModeratePrayerRequest(req: Req, v: PrayerViewer): boolean {
  if (req.visibility === "PRIVATE") return v.isCoordinator;
  return v.isCoordinator || v.isModerator;
}

/** Display name for the author, hiding identity on anonymous requests for everyone but the author. */
export function prayerAuthorLabel(req: Pick<PrayerRequest, "anonymous" | "authorId">, authorName: string, viewerId: string): string {
  if (req.anonymous) return req.authorId === viewerId ? `${authorName} (shown to others as Anonymous)` : "Anonymous";
  return authorName;
}

export const VISIBILITY_EXPLANATION = {
  PRIVATE: "Only you, this community's prayer coordinators, and prayer-team members a coordinator assigns can see this request.",
  GROUP: "Members of the selected group can see this request (after moderation, if enabled), along with moderators and prayer coordinators.",
  ORGANIZATION: "All members of this community can see this request (after moderation, if enabled).",
} as const;
