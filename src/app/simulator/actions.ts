"use server";

import { redirect } from "next/navigation";
import { getSimulator } from "@/server/payments/providers";
import { simulatorAllowed } from "@/server/payments/providers/simulator";
import { processPaymentEvent } from "@/server/payments/events";
import { syncConnectionByAccount } from "@/server/payments/connections";
import { safeNextPath } from "@/lib/urls";
import { env } from "@/server/env";
import { db } from "@/server/db";
import { revalidatePath } from "next/cache";

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

async function deliver(hooks: { raw: string; signature: string }[]) {
  const sim = getSimulator();
  for (const h of hooks) {
    const ev = await sim.parseWebhook(h.raw, new Headers({ "x-simulator-signature": h.signature }));
    await processPaymentEvent("SIMULATOR", ev);
  }
}

export async function simulateSubscribe(fd: FormData) {
  if (!simulatorAllowed()) throw new Error("Simulator disabled");
  const reference = String(fd.get("reference"));
  if (String(fd.get("outcome")) === "cancel") redirect(back(String(fd.get("cancel"))));
  await deliver(await getSimulator().activateSubscription(reference));
  redirect(back(String(fd.get("return"))));
}

export async function simulateSubscriptionEvent(fd: FormData) {
  if (!simulatorAllowed()) throw new Error("Simulator disabled");
  const id = String(fd.get("subscriptionId"));
  const op = String(fd.get("op"));
  const sim = getSimulator();
  if (op === "charge") await deliver([await sim.chargeSubscription(id, "succeeded")]);
  else if (op === "fail") await deliver([await sim.chargeSubscription(id, "failed")]);
  else if (op === "cancel") await deliver([await sim.cancelAtProvider(id)]);
  revalidatePath("/simulator");
}

/** Creates a payout of everything confirmed but not yet paid out for a simulated account. */
export async function simulatePayout(fd: FormData) {
  if (!simulatorAllowed()) throw new Error("Simulator disabled");
  const accountId = String(fd.get("accountId"));
  const status = String(fd.get("status")) === "paid" ? "paid" : "pending";
  const conn = await db.paymentProviderConnection.findUnique({ where: { provider_providerAccountId: { provider: "SIMULATOR", providerAccountId: accountId } } });
  if (!conn) throw new Error("Unknown account");
  const [net, settled] = await Promise.all([
    db.ledgerEntry.groupBy({ by: ["currency"], where: { organizationId: conn.organizationId }, _sum: { amount: true } }),
    db.settlementRecord.groupBy({ by: ["currency"], where: { connectionId: conn.id, status: { in: ["PAID", "PENDING"] } }, _sum: { amount: true } }),
  ]);
  for (const n of net) {
    const due = (n._sum.amount ?? 0) - (settled.find((s) => s.currency === n.currency)?._sum.amount ?? 0);
    if (due > 0) await getSimulator().createPayout(accountId, due, n.currency, status);
  }
  revalidatePath("/simulator");
}

export async function simulatePayoutStatus(fd: FormData) {
  if (!simulatorAllowed()) throw new Error("Simulator disabled");
  const status = String(fd.get("status")) as "paid" | "failed";
  await deliver([await getSimulator().setPayoutStatus(String(fd.get("payoutId")), status)]);
  revalidatePath("/simulator");
}

export async function simulateAccountDecision(fd: FormData) {
  if (!simulatorAllowed()) throw new Error("Simulator disabled");
  const accountId = String(fd.get("accountId"));
  const status = String(fd.get("status")) as "verified" | "pending" | "restricted" | "onboarding_required";
  await getSimulator().setAccountStatus(accountId, status);
  await syncConnectionByAccount("SIMULATOR", accountId);
  redirect(safeNextPath(back(String(fd.get("return"))), "/app"));
}
