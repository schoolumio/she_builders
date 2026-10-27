import "server-only";
import type { Plan, PlanEntitlement, Subscription } from "@prisma/client";
import { db } from "../db";
import { EntitlementError } from "../errors";
import { FEATURES, LIMITS, type FeatureKey, type LimitKey } from "./catalog";

export type Entitlements = {
  plan: Pick<Plan, "id" | "code" | "name" | "platformFeeBps">;
  subscription: Subscription | null;
  /** True when a paid plan has lapsed and the org fell back to FREE. */
  degraded: boolean;
  features: Set<FeatureKey>;
  limits: Map<LimitKey, number | null>;
};

/** A subscription grants its plan while trialing, active, or past due within the grace period. */
export function subscriptionGrantsPlan(sub: Pick<Subscription, "status" | "trialEndsAt" | "graceEndsAt" | "currentPeriodEnd">, now = new Date()): boolean {
  switch (sub.status) {
    case "ACTIVE":
      return !sub.currentPeriodEnd || sub.currentPeriodEnd > now || (!!sub.graceEndsAt && sub.graceEndsAt > now);
    case "TRIALING":
      return !sub.trialEndsAt || sub.trialEndsAt > now;
    case "PAST_DUE":
      return !!sub.graceEndsAt && sub.graceEndsAt > now;
    case "CANCELED":
      // Cancellation takes effect at period end.
      return !!sub.currentPeriodEnd && sub.currentPeriodEnd > now;
    default:
      return false;
  }
}

function build(plan: Plan & { entitlements: PlanEntitlement[] }, subscription: Subscription | null, degraded: boolean): Entitlements {
  const features = new Set<FeatureKey>();
  const limits = new Map<LimitKey, number | null>();
  for (const e of plan.entitlements) {
    if (e.key in FEATURES && e.enabled) features.add(e.key as FeatureKey);
    if (e.key in LIMITS) limits.set(e.key as LimitKey, e.enabled ? e.limit : 0);
  }
  return { plan, subscription, degraded, features, limits };
}

export async function getEntitlements(organizationId: string, now = new Date()): Promise<Entitlements> {
  const subscription = await db.subscription.findUnique({
    where: { organizationId },
    include: { plan: { include: { entitlements: true } } },
  });
  if (subscription && subscriptionGrantsPlan(subscription, now)) {
    const { plan, ...sub } = subscription;
    return build(plan, sub, false);
  }
  const free = await db.plan.findUnique({ where: { code: "FREE" }, include: { entitlements: true } });
  if (!free) throw new Error("FREE plan missing — run the database seed (npm run db:seed).");
  const sub = subscription ? (({ plan: _p, ...s }) => s)(subscription) : null;
  return build(free, sub, !!subscription && subscription.plan.code !== "FREE");
}

export function hasFeature(ent: Entitlements, key: FeatureKey) {
  return ent.features.has(key);
}

export function limitOf(ent: Entitlements, key: LimitKey): number | null {
  return ent.limits.has(key) ? ent.limits.get(key)! : 0;
}

export async function assertFeature(organizationId: string, key: FeatureKey) {
  const ent = await getEntitlements(organizationId);
  if (!ent.features.has(key)) {
    throw new EntitlementError(`${FEATURES[key]} is not included in the ${ent.plan.name} plan. An owner can upgrade in Billing.`);
  }
  return ent;
}

/** Throws when adding `adding` more units would exceed the plan limit. */
export async function assertWithinLimit(organizationId: string, key: LimitKey, currentCount: number, adding = 1) {
  const ent = await getEntitlements(organizationId);
  const limit = limitOf(ent, key);
  if (limit !== null && currentCount + adding > limit) {
    throw new EntitlementError(`Your ${ent.plan.name} plan allows ${limit} ${LIMITS[key].toLowerCase()}. An owner can upgrade in Billing.`);
  }
  return ent;
}
