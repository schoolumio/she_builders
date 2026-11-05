import "server-only";
import { db } from "../db";
import { ConflictError } from "../errors";
import { audit } from "../audit";
import { invalidateAllUserSessions } from "../auth/session";
import { randomToken } from "../crypto";

/** Everything we hold about the user that they are entitled to receive (their own data only). */
export async function exportUserData(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, name: true, displayName: true, bio: true, timezone: true, locale: true, createdAt: true, emailVerifiedAt: true },
  });
  const [memberships, prayerRequests, testimonies, donations, attendances, enrollments, notificationPrefs, groups, encouragements] = await Promise.all([
    db.membership.findMany({ where: { userId }, select: { roles: true, status: true, joinedAt: true, organization: { select: { name: true, slug: true } } } }),
    db.prayerRequest.findMany({ where: { authorId: userId }, select: { title: true, body: true, visibility: true, anonymous: true, status: true, createdAt: true, updates: { select: { body: true, createdAt: true } }, organization: { select: { name: true } } } }),
    db.testimony.findMany({ where: { authorId: userId }, select: { title: true, body: true, audience: true, moderationStatus: true, createdAt: true } }),
    db.donation.findMany({ where: { donorUserId: userId }, select: { reference: true, receiptNumber: true, amount: true, currency: true, status: true, createdAt: true, purpose: true, organization: { select: { name: true } } } }),
    db.meetingAttendance.findMany({ where: { userId }, select: { source: true, firstJoinedAt: true, totalSeconds: true, occurrence: { select: { startsAt: true, meeting: { select: { title: true } } } } } }),
    db.programmeEnrollment.findMany({ where: { userId }, select: { createdAt: true, programme: { select: { title: true } }, _count: { select: { completions: true } } } }),
    db.notificationPreference.findMany({ where: { userId }, select: { category: true, inApp: true, email: true } }),
    db.groupMembership.findMany({ where: { userId }, select: { role: true, group: { select: { name: true } } } }),
    db.postComment.findMany({ where: { authorId: userId }, select: { body: true, createdAt: true, prayerRequest: { select: { title: true } }, testimony: { select: { title: true } } } }),
  ]);
  await audit({ actorId: userId, action: "privacy.data_exported", targetType: "User", targetId: userId });
  return { exportedAt: new Date().toISOString(), user, memberships, groups, prayerRequests, testimonies, encouragements, donations, attendances, enrollments, notificationPrefs };
}

/**
 * Deletes the account. Personal content is removed; donation records are kept for financial
 * record-keeping but detached from the user and anonymised. See docs/SECURITY.md § Data protection.
 */
export async function deleteAccount(userId: string) {
  const ownerships = await db.membership.findMany({ where: { userId, status: "ACTIVE", roles: { has: "OWNER" } }, select: { organizationId: true } });
  for (const o of ownerships) {
    const owners = await db.membership.count({ where: { organizationId: o.organizationId, status: "ACTIVE", roles: { has: "OWNER" } } });
    if (owners <= 1) throw new ConflictError("Transfer ownership of your communities before deleting your account.");
  }
  await db.$transaction(async (tx) => {
    await tx.donation.updateMany({ where: { donorUserId: userId }, data: { donorUserId: null, donorName: null, donorEmail: null, message: null, anonymous: true } });
    await tx.prayerRequest.deleteMany({ where: { authorId: userId } });
    await tx.testimony.deleteMany({ where: { authorId: userId } });
    await tx.postComment.deleteMany({ where: { authorId: userId } });
    await tx.testimonyReaction.deleteMany({ where: { userId } });
    await tx.sessionInterest.deleteMany({ where: { userId } });
    await tx.groupMembership.deleteMany({ where: { userId } });
    await tx.membership.updateMany({ where: { userId }, data: { status: "LEFT", roles: ["MEMBER"] } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${randomToken(12)}@deleted.invalid`,
        name: "Deleted user",
        displayName: null,
        avatarUrl: null,
        bio: null,
        passwordHash: null,
        status: "DELETED",
        deletedAt: new Date(),
        platformRole: null,
      },
    });
    await tx.auditLog.create({ data: { actorId: null, action: "privacy.account_deleted", targetType: "User", targetId: userId } });
  });
  await invalidateAllUserSessions(userId);
}
