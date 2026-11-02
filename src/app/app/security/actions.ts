"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { withUser } from "@/server/page";
import type { ActionState } from "@/server/action";
import { beginMfaEnrolment, confirmMfaEnrolment, disableMfa, regenerateRecoveryCodes } from "@/server/auth/mfa";
import { SESSION_COOKIE } from "@/server/auth/session";
import { formToObject } from "@/lib/validation";

export async function beginMfaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return withUser(fd, async (u) => {
    const { secret, qrSvg } = await beginMfaEnrolment(u.id);
    return { ok: true, data: { secret, qrSvg } };
  });
}

export async function confirmMfaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return withUser(fd, async (u) => {
    const codes = await confirmMfaEnrolment(u.id, formToObject(fd), (await cookies()).get(SESSION_COOKIE)?.value);
    // No revalidation here: re-rendering the page would unmount the one-time recovery codes.
    return { ok: true, message: "Two-factor authentication is on. Other devices have been signed out.", data: { codes } };
  });
}

export async function regenerateCodesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return withUser(fd, async (u) => {
    const codes = await regenerateRecoveryCodes(u.id, formToObject(fd));
    return { ok: true, message: "New recovery codes created. Your old codes no longer work.", data: { codes } };
  });
}

export async function disableMfaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return withUser(fd, async (u) => {
    await disableMfa(u.id, formToObject(fd));
    revalidatePath("/app", "layout");
    return { ok: true, message: "Two-factor authentication is off." };
  });
}
