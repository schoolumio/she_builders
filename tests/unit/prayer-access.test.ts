import { describe, expect, it } from "vitest";
import { canModeratePrayerRequest, canViewPrayerRequest, prayerAuthorLabel, type PrayerViewer } from "@/server/prayer/access";

const viewer = (o: Partial<PrayerViewer> = {}): PrayerViewer => ({ userId: "viewer", isCoordinator: false, isModerator: false, groupIds: [], assignedRequestIds: new Set(), ...o });
const req = (o: Partial<{ id: string; authorId: string; visibility: "PRIVATE" | "GROUP" | "ORGANIZATION"; groupId: string | null; moderationStatus: "PENDING" | "APPROVED" | "REJECTED" | "HIDDEN" }> = {}) => ({
  id: "r1",
  authorId: "author",
  visibility: "ORGANIZATION" as const,
  groupId: null,
  moderationStatus: "APPROVED" as const,
  ...o,
});

describe("canViewPrayerRequest", () => {
  it("private requests: only author, coordinators and assignees", () => {
    const r = req({ visibility: "PRIVATE" });
    expect(canViewPrayerRequest(r, viewer({ userId: "author" }))).toBe(true);
    expect(canViewPrayerRequest(r, viewer({ isCoordinator: true }))).toBe(true);
    expect(canViewPrayerRequest(r, viewer({ assignedRequestIds: new Set(["r1"]) }))).toBe(true);
    expect(canViewPrayerRequest(r, viewer())).toBe(false);
    expect(canViewPrayerRequest(r, viewer({ isModerator: true }))).toBe(false);
  });

  it("group requests: group members once approved", () => {
    const r = req({ visibility: "GROUP", groupId: "g1" });
    expect(canViewPrayerRequest(r, viewer({ groupIds: ["g1"] }))).toBe(true);
    expect(canViewPrayerRequest(r, viewer({ groupIds: ["g2"] }))).toBe(false);
    expect(canViewPrayerRequest({ ...r, moderationStatus: "PENDING" }, viewer({ groupIds: ["g1"] }))).toBe(false);
    expect(canViewPrayerRequest({ ...r, moderationStatus: "PENDING" }, viewer({ isModerator: true }))).toBe(true);
  });

  it("organisation requests: everyone once approved, hidden ones only to moderators", () => {
    expect(canViewPrayerRequest(req(), viewer())).toBe(true);
    expect(canViewPrayerRequest(req({ moderationStatus: "HIDDEN" }), viewer())).toBe(false);
    expect(canViewPrayerRequest(req({ moderationStatus: "HIDDEN" }), viewer({ isModerator: true }))).toBe(true);
    expect(canViewPrayerRequest(req({ moderationStatus: "REJECTED" }), viewer({ userId: "author" }))).toBe(true);
  });

  it("moderators cannot moderate private requests; coordinators can", () => {
    expect(canModeratePrayerRequest(req({ visibility: "PRIVATE" }), viewer({ isModerator: true }))).toBe(false);
    expect(canModeratePrayerRequest(req({ visibility: "PRIVATE" }), viewer({ isCoordinator: true }))).toBe(true);
  });

  it("hides anonymous authors from everyone but the author", () => {
    expect(prayerAuthorLabel({ anonymous: true, authorId: "a" }, "Ada", "b")).toBe("Anonymous");
    expect(prayerAuthorLabel({ anonymous: true, authorId: "a" }, "Ada", "a")).toContain("Ada");
    expect(prayerAuthorLabel({ anonymous: false, authorId: "a" }, "Ada", "b")).toBe("Ada");
  });
});
