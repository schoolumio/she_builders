"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withOrg, str } from "@/server/page";
import type { ActionState } from "@/server/action";
import { formToObject } from "@/lib/validation";
import { setOrganizationImage, updateCommunitySettings, updateOrganizationProfile } from "@/server/orgs/service";
import { storePublicImage } from "@/server/storage";
import { createInvitations, decideJoinRequest, revokeInvitation, setMemberRoles, setMemberStatus, transferOwnership } from "@/server/members/service";
import { addGroupMember, archiveGroup, createGroup, removeGroupMember, updateGroup } from "@/server/groups/service";
import { cancelMeetingSeries, cancelOccurrence, createMeeting, markAttendance, rescheduleOccurrence, setPostMeetingNote, updateMeeting } from "@/server/meetings/service";
import { archiveAnnouncement, deletePrayerPoint, moderateTestimony, resolveReport, saveAnnouncement, savePrayerPoint } from "@/server/content/service";
import { assignPrayerRequest, moderatePrayerRequest, unassignPrayerRequest } from "@/server/prayer/service";
import { deleteActivity, saveActivity, saveProgramme, setProgrammeStatus } from "@/server/programmes/service";
import { deleteGift, saveGift, setPaidGiftsEnabled } from "@/server/gifts/service";
import { openBillingPortal, setCancelAtPeriodEnd, startSubscriptionCheckout } from "@/server/billing/service";
import { requirePermission } from "@/server/tenancy/context";
import { ValidationError } from "@/server/errors";

const ok = (message: string): ActionState => ({ ok: true, message });

// Settings ------------------------------------------------------------------------------------

export async function updateProfileAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await updateOrganizationProfile(ctx, formToObject(fd));
    revalidatePath(`/o/${slug}`, "layout");
    return ok("Community profile saved.");
  });
}

export async function updateCommunitySettingsAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await updateCommunitySettings(ctx, formToObject(fd));
    revalidatePath(`/o/${slug}`, "layout");
    return ok("Settings saved.");
  });
}

export async function uploadImageAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    requirePermission(ctx, "org.settings");
    const kind = str(fd, "kind") === "cover" ? "cover" : "logo";
    const file = fd.get("file");
    if (!(file instanceof File)) throw new ValidationError("Choose an image.");
    const url = await storePublicImage(file, `orgs/${ctx.org.id}/${kind}`);
    await setOrganizationImage(ctx, kind, url);
    revalidatePath(`/o/${slug}`, "layout");
    return ok(kind === "logo" ? "Logo updated." : "Cover image updated.");
  });
}

// Members ---------------------------------------------------------------------------------------

export async function inviteAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    const res = await createInvitations(ctx, formToObject(fd));
    revalidatePath(`/o/${slug}/admin/invitations`);
    const invited = res.filter((r) => r.status === "invited").length;
    const already = res.length - invited;
    return ok(`${invited} invitation${invited === 1 ? "" : "s"} sent.${already ? ` ${already} already a member.` : ""}`);
  });
}

export async function revokeInvitationAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await revokeInvitation(ctx, str(fd, "id"));
    revalidatePath(`/o/${slug}/admin/invitations`);
  });
}

export async function joinRequestAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await decideJoinRequest(ctx, str(fd, "id"), str(fd, "decision") === "approve");
    revalidatePath(`/o/${slug}/admin/members`);
  });
}

export async function setRolesAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await setMemberRoles(ctx, str(fd, "id"), formToObject(fd));
    revalidatePath(`/o/${slug}/admin/members`);
    return ok("Roles updated.");
  });
}

export async function memberStatusAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    const status = str(fd, "status");
    if (status !== "SUSPENDED" && status !== "ACTIVE" && status !== "REMOVED") throw new ValidationError("Invalid status.");
    await setMemberStatus(ctx, str(fd, "id"), status);
    revalidatePath(`/o/${slug}/admin/members`);
  });
}

export async function transferOwnershipAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await transferOwnership(ctx, str(fd, "id"));
    revalidatePath(`/o/${slug}`, "layout");
    return ok("Ownership transferred.");
  });
}

// Groups ----------------------------------------------------------------------------------------

export async function saveGroupAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    const id = str(fd, "id");
    if (id) await updateGroup(ctx, id, formToObject(fd));
    else await createGroup(ctx, formToObject(fd));
    revalidatePath(`/o/${slug}/admin/groups`);
    return ok("Group saved.");
  });
}

export async function archiveGroupAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await archiveGroup(ctx, str(fd, "id"));
    revalidatePath(`/o/${slug}/admin/groups`);
  });
}

export async function groupMemberAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    if (str(fd, "op") === "remove") await removeGroupMember(ctx, str(fd, "groupId"), str(fd, "userId"));
    else await addGroupMember(ctx, str(fd, "groupId"), str(fd, "userId"), str(fd, "role") === "LEADER" ? "LEADER" : "MEMBER");
    revalidatePath(`/o/${slug}/admin/groups`);
  });
}

// Meetings --------------------------------------------------------------------------------------

export async function createMeetingAction(slug: string, _: ActionState, fd: FormData) {
  let id = "";
  const res = await withOrg(slug, fd, async (ctx) => {
    id = (await createMeeting(ctx, formToObject(fd))).id;
  });
  if (res?.ok) redirect(`/o/${slug}/admin/meetings/${id}?created=1`);
  return res;
}

export async function updateMeetingAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await updateMeeting(ctx, str(fd, "meetingId"), formToObject(fd));
    revalidatePath(`/o/${slug}`, "layout");
    return ok("Meeting saved. Members affected by a schedule change have been notified.");
  });
}

export async function cancelSeriesAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await cancelMeetingSeries(ctx, str(fd, "meetingId"), str(fd, "reason") || undefined);
    revalidatePath(`/o/${slug}`, "layout");
    return ok("Meeting cancelled and members notified.");
  });
}

export async function cancelOccurrenceAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await cancelOccurrence(ctx, str(fd, "occurrenceId"), str(fd, "reason") || undefined);
    revalidatePath(`/o/${slug}`, "layout");
    return ok("Session cancelled and members notified.");
  });
}

export async function rescheduleOccurrenceAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await rescheduleOccurrence(ctx, str(fd, "occurrenceId"), formToObject(fd));
    revalidatePath(`/o/${slug}`, "layout");
    return ok("Session rescheduled and members notified.");
  });
}

export async function attendanceAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    const n = await markAttendance(ctx, str(fd, "occurrenceId"), fd.getAll("userId").map(String));
    revalidatePath(`/o/${slug}/admin/meetings`, "layout");
    return ok(`Attendance recorded for ${n} member${n === 1 ? "" : "s"}.`);
  });
}

export async function postMeetingNoteAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await setPostMeetingNote(ctx, str(fd, "occurrenceId"), str(fd, "note"));
    return ok("Note saved.");
  });
}

// Content ---------------------------------------------------------------------------------------

export async function saveAnnouncementAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    const a = await saveAnnouncement(ctx, formToObject(fd), str(fd, "id") || undefined);
    revalidatePath(`/o/${slug}`, "layout");
    return ok(a.status === "PUBLISHED" ? "Announcement published." : "Draft saved.");
  });
}

export async function archiveAnnouncementAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await archiveAnnouncement(ctx, str(fd, "id"));
    revalidatePath(`/o/${slug}`, "layout");
  });
}

export async function savePrayerPointAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    const p = await savePrayerPoint(ctx, formToObject(fd), str(fd, "id") || undefined);
    revalidatePath(`/o/${slug}`, "layout");
    return ok(p.status === "PUBLISHED" ? "Prayer point published." : "Draft saved.");
  });
}

export async function deletePrayerPointAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await deletePrayerPoint(ctx, str(fd, "id"));
    revalidatePath(`/o/${slug}`, "layout");
  });
}

// Prayer care & moderation ------------------------------------------------------------------------

export async function moderatePrayerAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    const d = str(fd, "decision");
    if (d !== "APPROVED" && d !== "REJECTED" && d !== "HIDDEN") throw new ValidationError("Invalid decision.");
    await moderatePrayerRequest(ctx, str(fd, "id"), d);
    revalidatePath(`/o/${slug}`, "layout");
  });
}

export async function assignPrayerAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await assignPrayerRequest(ctx, str(fd, "id"), formToObject(fd));
    revalidatePath(`/o/${slug}/admin/prayer/${str(fd, "id")}`);
    return ok("Assigned.");
  });
}

export async function unassignPrayerAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await unassignPrayerRequest(ctx, str(fd, "id"), str(fd, "userId"));
    revalidatePath(`/o/${slug}/admin/prayer/${str(fd, "id")}`);
  });
}

export async function moderateTestimonyAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    const d = str(fd, "decision");
    if (d !== "APPROVED" && d !== "REJECTED" && d !== "HIDDEN") throw new ValidationError("Invalid decision.");
    await moderateTestimony(ctx, str(fd, "id"), d);
    revalidatePath(`/o/${slug}`, "layout");
  });
}

export async function resolveReportAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await resolveReport(ctx, str(fd, "id"), str(fd, "status") === "DISMISSED" ? "DISMISSED" : "RESOLVED", str(fd, "resolution") || undefined);
    revalidatePath(`/o/${slug}/admin/moderation`);
  });
}

// Programmes ------------------------------------------------------------------------------------

export async function saveProgrammeAction(slug: string, _: ActionState, fd: FormData) {
  let id = str(fd, "id");
  const res = await withOrg(slug, fd, async (ctx) => {
    id = (await saveProgramme(ctx, formToObject(fd), id || undefined)).id;
  });
  if (res?.ok && !str(fd, "id")) redirect(`/o/${slug}/admin/programmes/${id}`);
  if (res?.ok) revalidatePath(`/o/${slug}/admin/programmes/${id}`);
  return res?.ok ? ok("Programme saved.") : res;
}

export async function saveActivityAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await saveActivity(ctx, str(fd, "programmeId"), formToObject(fd));
    revalidatePath(`/o/${slug}/admin/programmes/${str(fd, "programmeId")}`);
    return ok("Activity saved.");
  });
}

export async function deleteActivityAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await deleteActivity(ctx, str(fd, "programmeId"), str(fd, "activityId"));
    revalidatePath(`/o/${slug}/admin/programmes/${str(fd, "programmeId")}`);
  });
}

export async function programmeStatusAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    const s = str(fd, "status");
    if (s !== "DRAFT" && s !== "PUBLISHED" && s !== "ARCHIVED") throw new ValidationError("Invalid status.");
    await setProgrammeStatus(ctx, str(fd, "programmeId"), s);
    revalidatePath(`/o/${slug}`, "layout");
  });
}

// Gifts -----------------------------------------------------------------------------------------

export async function saveGiftAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await saveGift(ctx, formToObject(fd), str(fd, "id") || undefined);
    revalidatePath(`/o/${slug}/admin/gifts`);
    return ok("Gift saved.");
  });
}

export async function deleteGiftAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await deleteGift(ctx, str(fd, "id"));
    revalidatePath(`/o/${slug}/admin/gifts`);
  });
}

export async function paidGiftsAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await setPaidGiftsEnabled(ctx, str(fd, "enabled") === "1");
    revalidatePath(`/o/${slug}/admin/gifts`);
  });
}

// Billing ---------------------------------------------------------------------------------------

export async function subscribeAction(slug: string, _: ActionState, fd: FormData) {
  let url = "";
  const res = await withOrg(slug, fd, async (ctx) => {
    url = await startSubscriptionCheckout(ctx, str(fd, "plan"), str(fd, "interval") === "YEARLY" ? "YEARLY" : "MONTHLY");
  });
  if (res?.ok && url) redirect(url);
  return res;
}

export async function billingPortalAction(slug: string, _: ActionState, fd: FormData) {
  let url = "";
  const res = await withOrg(slug, fd, async (ctx) => {
    url = await openBillingPortal(ctx);
  });
  if (res?.ok && url) redirect(url);
  return res;
}

export async function cancelSubscriptionAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await setCancelAtPeriodEnd(ctx, str(fd, "cancel") === "1");
    revalidatePath(`/o/${slug}/admin/billing`);
    return ok(str(fd, "cancel") === "1" ? "Your subscription will end at the close of the current period." : "Cancellation withdrawn.");
  });
}
