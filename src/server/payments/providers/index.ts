import "server-only";
import type { PaymentProviderId } from "@prisma/client";
import type { PaymentProvider } from "../types";
import { PaystackProvider } from "./paystack";
import { StripeConnectProvider } from "./stripe";
import { SimulatorProvider } from "./simulator";

const registry = new Map<PaymentProviderId, PaymentProvider>();

function init() {
  if (registry.size) return;
  registry.set("PAYSTACK", new PaystackProvider());
  registry.set("STRIPE", new StripeConnectProvider());
  registry.set("SIMULATOR", new SimulatorProvider());
}

export function getPaymentProvider(id: PaymentProviderId): PaymentProvider {
  init();
  return registry.get(id)!;
}

/** Providers with credentials configured (simulator only outside production). */
export function availableProviders(): PaymentProvider[] {
  init();
  return [...registry.values()].filter((p) => p.isAvailable());
}

export function allProviders(): PaymentProvider[] {
  init();
  return [...registry.values()];
}

/** Test hook. */
export function setPaymentProvider(id: PaymentProviderId, provider: PaymentProvider) {
  init();
  registry.set(id, provider);
}

export function getSimulator(): SimulatorProvider {
  return getPaymentProvider("SIMULATOR") as SimulatorProvider;
}
