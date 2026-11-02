"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withOrg, str } from "@/server/page";
import type { ActionState } from "@/server/action";
import { formToObject } from "@/lib/validation";
import { createPrayerRequest, acknowledgePrayer, updateOwnPrayerRequest, deleteOwnPrayerRequest } from "@/server/prayer/service";
import { submitTestimony, withdrawTestimony, reportContent } from "@/server/content/service";
import { joinGroup, leaveGroup } from "@/server/groups/service";
import { enroll, unenroll, setActivityComplete } from "@/server/programmes/service";
import { leaveOrganization } from "@/server/members/service";
import { recordJoinIntent } from "@/server/meetings/service";
import { safeExternalUrl } from "@/lib/urls";
import { ValidationError } from "@/server/errors";

export async function createPrayerRequestAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await withOrg(slug, fd, async (ctx) => {
    id = (await createPrayerRequest(ctx, formToObject(fd))).id;
  });
  if (res?.ok) redirect(`/o/${slug}/prayer/${id}?created=1`);
  return res;
}

export async function acknowledgePrayerAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return withOrg(slug, fd, async (ctx) => {
    await acknowledgePrayer(ctx, str(fd, "id"));
    revalidatePath(`/o/${slug}/prayer`, "layout");
    return { ok: true, message: "Thank you for praying." };
  });
}

export async function updatePrayerAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return withOrg(slug, fd, async (ctx) => {
    await updateOwnPrayerRequest(ctx, str(fd, "id"), formToObject(fd));
    revalidatePath(`/o/${slug}/prayer/${str(fd, "id")}`);
    return { ok: true, message: "Update saved." };
  });
}

export async function deletePrayerAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const res = await withOrg(slug, fd, async (ctx) => {
    await deleteOwnPrayerRequest(ctx, str(fd, "id"));
  });
  if (res?.ok) redirect(`/o/${slug}/prayer?tab=mine`);
  return res;
}

export async function submitTestimonyAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return withOrg(slug, fd, async (ctx) => {
    const t = await submitTestimony(ctx, formToObject(fd));
    revalidatePath(`/o/${slug}/testimonies`);
    return { ok: true, message: t.moderationStatus === "PENDING" ? "Thank you! Your testimony will appear once a moderator has reviewed it." : "Thank you for sharing your testimony." };
  });
}

export async function withdrawTestimonyAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return withOrg(slug, fd, async (ctx) => {
    await withdrawTestimony(ctx, str(fd, "id"));
    revalidatePath(`/o/${slug}/testimonies`);
  });
}

export async function reportAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return withOrg(slug, fd, async (ctx) => {
    await reportContent(ctx, formToObject(fd));
    return { ok: true, message: "Thank you. A moderator will review this report." };
  });
}

export async function groupMembershipAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return withOrg(slug, fd, async (ctx) => {
    if (str(fd, "op") === "join") await joinGroup(ctx, str(fd, "groupId"));
    else await leaveGroup(ctx, str(fd, "groupId"));
    revalidatePath(`/o/${slug}/groups`);
  });
}

export async function programmeEnrollmentAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return withOrg(slug, fd, async (ctx) => {
    if (str(fd, "op") === "enroll") await enroll(ctx, str(fd, "programmeId"));
    else await unenroll(ctx, str(fd, "programmeId"));
    revalidatePath(`/o/${slug}/programmes`, "layout");
  });
}

export async function activityCompletionAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return withOrg(slug, fd, async (ctx) => {
    await setActivityComplete(ctx, str(fd, "programmeId"), str(fd, "activityId"), str(fd, "complete") === "1");
    revalidatePath(`/o/${slug}/programmes/${str(fd, "programmeId")}`);
  });
}

export async function leaveOrganizationAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const res = await withOrg(slug, fd, async (ctx) => {
    await leaveOrganization(ctx);
  });
  if (res?.ok) redirect("/app");
  return res;
}

/** Records a join intent (never attendance) and sends the member to WhatsApp. */
export async function joinWhatsAppAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let url: string | null = null;
  const res = await withOrg(slug, fd, async (ctx) => {
    const occ = await recordJoinIntent(ctx, str(fd, "occurrenceId"));
    url = safeExternalUrl(occ.meeting.externalUrl);
    if (!url) throw new ValidationError("This meeting does not have a joining link. Check the instructions instead.");
  });
  if (res?.ok && url) redirect(url);
  return res;
}
