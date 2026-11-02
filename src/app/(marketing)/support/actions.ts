"use server";

import { runAction, type ActionState } from "@/server/action";
import { createSupportRequest } from "@/server/platform/service";
import { getCurrentUser, requestMeta } from "@/server/auth/current-user";
import { formToObject } from "@/lib/validation";

export async function supportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const user = await getCurrentUser();
    await createSupportRequest(user?.id ?? null, formToObject(fd), await requestMeta());
    return { ok: true, message: "Thank you — we've received your message and will reply by email." };
  });
}
