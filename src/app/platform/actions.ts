"use server";

import { revalidatePath } from "next/cache";
import type { OrgStatus, OrgVerification, SubscriptionStatus, SupportStatus } from "@prisma/client";
import { withUser, str } from "@/server/page";
import type { ActionState } from "@/server/action";
import { setOrganizationStatus, setOrganizationVerification, setPlanEntitlement, updatePlan, updateSupportRequest } from "@/server/platform/service";
import { assignPlanManually } from "@/server/billing/service";
import { platformReviewConnection } from "@/server/payments/connections";
import { ValidationError } from "@/server/errors";
import { toMinorUnits } from "@/lib/money";

export async function orgStatusAction(_: ActionState, fd: FormData) {
  return withUser(fd, async (u) => {
    const s = str(fd, "status") as OrgStatus;
    if (!["ACTIVE", "SUSPENDED", "CLOSED"].includes(s)) throw new ValidationError("Invalid status.");
    if (s !== "ACTIVE" && str(fd, "reason").length < 5) throw new ValidationError("Give a reason (it is recorded and shown to the owner).", { reason: "Required." });
    await setOrganizationStatus(u, str(fd, "id"), s, str(fd, "reason"));
    revalidatePath("/platform", "layout");
    return { ok: true, message: "Status updated." };
  });
}

export async function orgVerificationAction(_: ActionState, fd: FormData) {
  return withUser(fd, async (u) => {
    const v = str(fd, "verification") as OrgVerification;
    if (!["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"].includes(v)) throw new ValidationError("Invalid value.");
    await setOrganizationVerification(u, str(fd, "id"), v);
    revalidatePath("/platform", "layout");
    return { ok: true, message: "Verification updated." };
  });
}

export async function assignPlanAction(_: ActionState, fd: FormData) {
  return withUser(fd, async (u) => {
    const periodEnd = str(fd, "periodEnd");
    await assignPlanManually(u, str(fd, "id"), {
      planCode: str(fd, "plan"),
      status: str(fd, "status") as SubscriptionStatus,
      periodEnd: periodEnd ? new Date(periodEnd) : null,
      note: str(fd, "note") || undefined,
    });
    revalidatePath("/platform", "layout");
    return { ok: true, message: "Plan assigned." };
  });
}

export async function reviewConnectionAction(_: ActionState, fd: FormData) {
  return withUser(fd, async (u) => {
    await platformReviewConnection(u, str(fd, "id"), str(fd, "decision") === "approve", str(fd, "note") || undefined);
    revalidatePath("/platform", "layout");
    return { ok: true, message: "Review recorded." };
  });
}

export async function updatePlanAction(_: ActionState, fd: FormData) {
  return withUser(fd, async (u) => {
    const money = (k: string) => (str(fd, k) === "" ? null : toMinorUnits(Number(str(fd, k)), str(fd, "currency") || "USD"));
    await updatePlan(u, str(fd, "id"), {
      monthlyPrice: money("monthlyPrice"),
      yearlyPrice: money("yearlyPrice"),
      platformFeeBps: Math.round(Number(str(fd, "platformFeePercent") || "0") * 100),
      trialDays: Number(str(fd, "trialDays") || 0),
      graceDays: Number(str(fd, "graceDays") || 0),
      stripeMonthlyPriceId: str(fd, "stripeMonthlyPriceId") || null,
      stripeYearlyPriceId: str(fd, "stripeYearlyPriceId") || null,
      public: fd.get("public") === "on",
    });
    revalidatePath("/platform/plans");
    return { ok: true, message: "Plan saved." };
  });
}

export async function entitlementAction(_: ActionState, fd: FormData) {
  return withUser(fd, async (u) => {
    const limit = str(fd, "limit");
    await setPlanEntitlement(u, str(fd, "planId"), str(fd, "key"), fd.get("enabled") === "on", limit === "" ? null : Number(limit));
    revalidatePath("/platform/plans");
    return { ok: true, message: "Saved." };
  });
}

export async function supportStatusAction(_: ActionState, fd: FormData) {
  return withUser(fd, async (u) => {
    await updateSupportRequest(u, str(fd, "id"), str(fd, "status") as SupportStatus, str(fd, "note") || undefined);
    revalidatePath("/platform/support");
  });
}
