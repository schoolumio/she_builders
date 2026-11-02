"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import type { NotificationCategory } from "@prisma/client";
import { withUser, str } from "@/server/page";
import type { ActionState } from "@/server/action";
import { db } from "@/server/db";
import { parseInput } from "@/server/validate";
import { nameSchema, timezoneSchema, formToObject } from "@/lib/validation";
import { updatePreference } from "@/server/notifications";
import { deleteAccount } from "@/server/privacy/service";
import { createOrganization } from "@/server/orgs/service";
import { acceptInvitation } from "@/server/members/service";
import { SESSION_COOKIE } from "@/server/auth/session";
import { verifyPassword } from "@/server/auth/password";
import { ValidationError } from "@/server/errors";

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return withUser(fd, async (user) => {
    const d = parseInput(z.object({ name: nameSchema, displayName: z.string().trim().max(60).optional(), timezone: timezoneSchema }), formToObject(fd));
    await db.user.update({ where: { id: user.id }, data: { name: d.name, displayName: d.displayName || null, timezone: d.timezone } });
    revalidatePath("/app", "layout");
    return { ok: true, message: "Profile saved." };
  });
}

export async function updatePreferencesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return withUser(fd, async (user) => {
    for (const category of ["MEETINGS", "ANNOUNCEMENTS", "PRAYER", "PROGRAMMES", "FUNDRAISING"] as NotificationCategory[]) {
      await updatePreference(user.id, category, { inApp: fd.get(`${category}:inApp`) === "on", email: fd.get(`${category}:email`) === "on" });
    }
    return { ok: true, message: "Notification preferences saved." };
  });
}

export async function markAllReadAction() {
  await withUser(undefined, async (user) => {
    await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  });
  revalidatePath("/app", "layout");
}

export async function deleteAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await withUser(fd, async (user) => {
    if (str(fd, "confirm") !== "DELETE") throw new ValidationError("Type DELETE to confirm.", { confirm: "Type DELETE." });
    const full = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (full.passwordHash && !(await verifyPassword(str(fd, "password"), full.passwordHash))) {
      throw new ValidationError("Your password is not correct.", { password: "Incorrect password." });
    }
    await deleteAccount(user.id);
    (await cookies()).delete(SESSION_COOKIE);
  });
  if (res?.ok) redirect("/?deleted=1");
  return res;
}

export async function createOrganizationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let slug = "";
  const res = await withUser(fd, async (user) => {
    const org = await createOrganization(user, formToObject(fd));
    slug = org.slug;
  });
  if (res?.ok) redirect(`/o/${slug}/admin?welcome=1`);
  return res;
}

export async function acceptInvitationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let slug = "";
  const res = await withUser(fd, async (user) => {
    const r = await acceptInvitation(user, str(fd, "token"));
    slug = r.organization.slug;
  });
  if (res?.ok) redirect(`/o/${slug}`);
  return res;
}
