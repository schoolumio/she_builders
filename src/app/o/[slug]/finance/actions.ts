"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PaymentProviderId } from "@prisma/client";
import { withOrg, str } from "@/server/page";
import type { ActionState } from "@/server/action";
import { formToObject } from "@/lib/validation";
import { disconnect, refreshConnection, setFundraisingEnabled, startOnboarding } from "@/server/payments/connections";
import { addCampaignUpdate, createCampaign, decideCampaign, submitCampaignForApproval, updateCampaign } from "@/server/payments/campaigns";
import { requestRefund } from "@/server/payments/donations";
import { reconcileDonation } from "@/server/payments/events";
import { db } from "@/server/db";
import { requirePermission } from "@/server/tenancy/context";
import { NotFoundError, ValidationError } from "@/server/errors";
import { storePublicImage } from "@/server/storage";

const PROVIDERS: PaymentProviderId[] = ["PAYSTACK", "STRIPE", "SIMULATOR"];

export async function startOnboardingAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let redirectUrl: string | undefined;
  const res = await withOrg(slug, fd, async (ctx) => {
    const provider = str(fd, "provider") as PaymentProviderId;
    if (!PROVIDERS.includes(provider)) throw new ValidationError("Choose a provider.");
    const r = await startOnboarding(ctx, provider, formToObject(fd));
    redirectUrl = r.redirectUrl;
    revalidatePath(`/o/${slug}/finance`, "layout");
    return { ok: true, message: "Account details sent to the provider. Verification status is shown below." };
  });
  if (res?.ok && redirectUrl) redirect(redirectUrl);
  return res;
}

export async function refreshConnectionAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await refreshConnection(ctx, str(fd, "id"));
    revalidatePath(`/o/${slug}/finance`, "layout");
    return { ok: true, message: "Status refreshed from the provider." };
  });
}

export async function disconnectAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await disconnect(ctx, str(fd, "id"));
    revalidatePath(`/o/${slug}/finance`, "layout");
  });
}

export async function fundraisingToggleAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await setFundraisingEnabled(ctx, str(fd, "enabled") === "1");
    revalidatePath(`/o/${slug}`, "layout");
  });
}

export async function createCampaignAction(slug: string, _: ActionState, fd: FormData) {
  let id = "";
  const res = await withOrg(slug, fd, async (ctx) => {
    id = (await createCampaign(ctx, formToObject(fd))).id;
  });
  if (res?.ok) redirect(`/o/${slug}/finance/campaigns/${id}`);
  return res;
}

export async function updateCampaignAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await updateCampaign(ctx, str(fd, "id"), formToObject(fd));
    revalidatePath(`/o/${slug}/finance/campaigns/${str(fd, "id")}`);
    return { ok: true, message: "Campaign saved." };
  });
}

export async function campaignImageAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    requirePermission(ctx, "campaigns.draft");
    const c = await db.fundraisingCampaign.findFirst({ where: { id: str(fd, "id"), organizationId: ctx.org.id } });
    if (!c) throw new NotFoundError("Campaign not found.");
    const file = fd.get("file");
    if (!(file instanceof File)) throw new ValidationError("Choose an image.");
    const url = await storePublicImage(file, `orgs/${ctx.org.id}/campaigns`);
    await db.fundraisingCampaign.update({ where: { id: c.id }, data: { imageUrl: url } });
    revalidatePath(`/o/${slug}/finance/campaigns/${c.id}`);
    return { ok: true, message: "Image uploaded." };
  });
}

export async function campaignDecisionAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    const d = str(fd, "decision");
    if (d === "submit") await submitCampaignForApproval(ctx, str(fd, "id"));
    else if (d === "approve" || d === "reject" || d === "pause" || d === "resume" || d === "end") await decideCampaign(ctx, str(fd, "id"), d);
    else throw new ValidationError("Invalid decision.");
    revalidatePath(`/o/${slug}/finance/campaigns`, "layout");
  });
}

export async function campaignUpdateAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    await addCampaignUpdate(ctx, str(fd, "id"), str(fd, "body"));
    revalidatePath(`/o/${slug}/finance/campaigns/${str(fd, "id")}`);
    return { ok: true, message: "Update posted." };
  });
}

export async function refundAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    const r = await requestRefund(ctx, str(fd, "id"), formToObject(fd));
    revalidatePath(`/o/${slug}/finance/donations/${str(fd, "id")}`);
    return { ok: true, message: r.status === "succeeded" ? "Refund confirmed by the provider." : "Refund requested. It will be recorded once the provider confirms it." };
  });
}

export async function reconcileAction(slug: string, _: ActionState, fd: FormData) {
  return withOrg(slug, fd, async (ctx) => {
    requirePermission(ctx, "finance.view");
    const d = await db.donation.findFirst({ where: { id: str(fd, "id"), organizationId: ctx.org.id } });
    if (!d) throw new NotFoundError("Donation not found.");
    const outcome = await reconcileDonation(d.reference);
    revalidatePath(`/o/${slug}/finance/donations/${d.id}`);
    return { ok: true, message: outcome === "processed" ? "The provider confirmed a status change." : outcome === "mismatch" ? "The provider's record does not match ours — needs manual review." : "No change reported by the provider." };
  });
}
