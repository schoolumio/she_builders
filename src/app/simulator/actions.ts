"use server";

import { redirect } from "next/navigation";
import { getSimulator } from "@/server/payments/providers";
import { simulatorAllowed } from "@/server/payments/providers/simulator";
import { processPaymentEvent } from "@/server/payments/events";
import { syncConnectionByAccount } from "@/server/payments/connections";
import { safeNextPath } from "@/lib/urls";
import { env } from "@/server/env";

function back(url: string) {
  // Only redirect back into this application.
  try {
    const u = new URL(url, env.appUrl);
    return u.origin === new URL(env.appUrl).origin ? u.pathname + u.search : "/";
  } catch {
    return "/";
  }
}

export async function simulatePayment(fd: FormData) {
  if (!simulatorAllowed()) throw new Error("Simulator disabled");
  const reference = String(fd.get("reference"));
  const outcome = String(fd.get("outcome")) as "succeeded" | "failed" | "pending";
  const sim = getSimulator();
  const { raw, signature } = await sim.completeCheckout(reference, outcome);
  if (fd.get("deliverWebhook") === "on") {
    // Deliver through the same signature verification path as a real webhook.
    const ev = await sim.parseWebhook(raw, new Headers({ "x-simulator-signature": signature }));
    await processPaymentEvent("SIMULATOR", ev);
  }
  redirect(back(String(fd.get(outcome === "failed" ? "cancel" : "return"))));
}

export async function simulateAccountDecision(fd: FormData) {
  if (!simulatorAllowed()) throw new Error("Simulator disabled");
  const accountId = String(fd.get("accountId"));
  const status = String(fd.get("status")) as "verified" | "pending" | "restricted" | "onboarding_required";
  await getSimulator().setAccountStatus(accountId, status);
  await syncConnectionByAccount("SIMULATOR", accountId);
  redirect(safeNextPath(back(String(fd.get("return"))), "/app"));
}
