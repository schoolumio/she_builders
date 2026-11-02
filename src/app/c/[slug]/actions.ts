"use server";

import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/server/action";
import { getCurrentUser, requestMeta } from "@/server/auth/current-user";
import { requestToJoin } from "@/server/members/service";
import { createCheckout, startDonation } from "@/server/payments/donations";
import { UnauthenticatedError } from "@/server/errors";
import { formToObject } from "@/lib/validation";

export async function joinAction(orgId: string, slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let active = false;
  const res = await runAction(fd, async () => {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    const m = await requestToJoin(user, orgId, formToObject(fd));
    active = m.status === "ACTIVE";
    if (!active) return { ok: true, message: "Your request has been sent. You'll be notified when an administrator responds." };
  });
  if (res?.ok && active) redirect(`/o/${slug}`);
  return res;
}

export async function startDonationAction(slug: string, campaignId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let reference = "";
  const res = await runAction(fd, async () => {
    const user = await getCurrentUser();
    const r = await startDonation(user, slug, campaignId, formToObject(fd), await requestMeta());
    reference = r.reference;
  });
  if (res?.ok) redirect(`/donations/${reference}`);
  return res;
}

export async function payDonationAction(reference: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let url = "";
  const res = await runAction(fd, async () => {
    const user = await getCurrentUser();
    url = await createCheckout(reference, user?.id);
  });
  if (res?.ok && url) redirect(url);
  return res;
}
