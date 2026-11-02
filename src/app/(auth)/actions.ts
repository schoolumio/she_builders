"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/server/action";
import { authenticate, changePassword, registerUser, requestPasswordReset, resetPassword, sendVerificationEmail } from "@/server/auth/service";
import { getCurrentUser, requestMeta, startSession } from "@/server/auth/current-user";
import { invalidateSessionToken, SESSION_COOKIE } from "@/server/auth/session";
import { formToObject } from "@/lib/validation";
import { safeNextPath } from "@/lib/urls";
import { UnauthenticatedError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let next = "/app";
  const res = await runAction(fd, async () => {
    const meta = await requestMeta();
    const user = await authenticate(formToObject(fd), meta);
    // Rotate: drop any previous session cookie before issuing a new one.
    const old = (await cookies()).get(SESSION_COOKIE)?.value;
    if (old) await invalidateSessionToken(old);
    await startSession(user.id);
    next = safeNextPath(fd.get("next")?.toString());
  });
  if (res?.ok) redirect(next);
  return res;
}

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let next = "/app";
  const res = await runAction(fd, async () => {
    const meta = await requestMeta();
    const user = await registerUser(formToObject(fd), meta);
    await startSession(user.id);
    next = safeNextPath(fd.get("next")?.toString());
  });
  if (res?.ok) redirect(next);
  return res;
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSessionToken(token);
  jar.delete(SESSION_COOKIE);
  redirect("/");
}

export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await requestPasswordReset(formToObject(fd), await requestMeta());
    return { ok: true, message: "If an account exists for that address, we've emailed a reset link. It expires in 1 hour." };
  });
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(fd, async () => {
    await resetPassword(formToObject(fd));
  });
  if (res?.ok) redirect("/login?reset=1");
  return res;
}

export async function resendVerificationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    await rateLimit(`verify-resend:${user.id}`, 3, 3600);
    await sendVerificationEmail(user.id);
    return { ok: true, message: "We've sent a new confirmation link." };
  });
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    await changePassword(user.id, formToObject(fd), token);
    return { ok: true, message: "Password changed. Other devices have been signed out." };
  });
}
