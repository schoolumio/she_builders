import type { PrismaClient } from "@prisma/client";
import { DEFAULT_PLANS, FEATURES, LIMITS } from "../src/server/billing/catalog";

/** Idempotently creates the default plans. Existing prices/entitlements edited by admins are preserved. */
export async function seedPlans(db: PrismaClient) {
  for (const [position, p] of DEFAULT_PLANS.entries()) {
    const plan = await db.plan.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        name: p.name,
        description: p.description,
        currency: "USD",
        monthlyPrice: p.monthlyPrice,
        yearlyPrice: p.yearlyPrice,
        trialDays: p.trialDays,
        public: p.public,
        position,
      },
      update: {},
    });
    for (const key of Object.keys(FEATURES)) {
      await db.planEntitlement.upsert({
        where: { planId_key: { planId: plan.id, key } },
        create: { planId: plan.id, key, enabled: p.features.includes(key as never) },
        update: {},
      });
    }
    for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
      await db.planEntitlement.upsert({
        where: { planId_key: { planId: plan.id, key } },
        create: { planId: plan.id, key, enabled: true, limit: p.limits[key] },
        update: {},
      });
    }
  }
}
