import "server-only";
import type { BillingInterval, Plan, Subscription, SubscriptionStatus } from "@prisma/client";
import Stripe from "stripe";
import { db } from "../db";
import { AppError, ConfigurationError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { audit } from "../audit";
import { env } from "../env";
import type { Actor, OrgContext } from "../tenancy/context";
import { requirePlatformSuper } from "../tenancy/platform-access";
import { requirePermission } from "../tenancy/context";
import { getEntitlements } from "./entitlements";

/**
 * SaaS subscriptions: what an organisation pays BridgeCodes. Completely separate from the
 * donations an organisation receives (different tables, provider account and webhook endpoint).
 */
export function billingProviderName(): "stripe" | "none" {
  return process.env.BILLING_PROVIDER === "stripe" && process.env.STRIPE_SECRET_KEY ? "stripe" : "none";
}

let stripeClient: Stripe | undefined;
function stripe() {
  if (billingProviderName() !== "stripe") throw new ConfigurationError("Online subscription billing is not configured. Contact us to change plans.");
  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY!, { appInfo: { name: "Prayer Community Platform Billing" } });
  return stripeClient;
}

export async function listPlans(opts: { includeHidden?: boolean } = {}) {
  return db.plan.findMany({ where: opts.includeHidden ? {} : { public: true }, include: { entitlements: true }, orderBy: { position: "asc" } });
}

export async function getBillingOverview(ctx: OrgContext) {
  requirePermission(ctx, "billing.view");
  const [ent, invoices, plans, members, admins, groups, meetings] = await Promise.all([
    getEntitlements(ctx.org.id),
    db.subscriptionInvoice.findMany({ where: { organizationId: ctx.org.id }, orderBy: { createdAt: "desc" }, take: 24 }),
    listPlans(),
    db.membership.count({ where: { organizationId: ctx.org.id, status: "ACTIVE" } }),
    db.membership.count({ where: { organizationId: ctx.org.id, status: "ACTIVE", roles: { hasSome: ["OWNER", "ADMIN", "FINANCE_ADMIN", "PRAYER_COORDINATOR"] } } }),
    db.communityGroup.count({ where: { organizationId: ctx.org.id, archivedAt: null } }),
    db.meeting.count({ where: { organizationId: ctx.org.id, status: "ACTIVE" } }),
  ]);
  const usage = await db.usageRecord.findMany({ where: { organizationId: ctx.org.id }, orderBy: { period: "desc" }, take: 6 });
  return {
    entitlements: ent,
    invoices,
    plans,
    usage: { "limit.members": members, "limit.admins": admins, "limit.groups": groups, "limit.active_meetings": meetings },
    meetingMinutes: usage,
    provider: billingProviderName(),
  };
}

export async function startSubscriptionCheckout(ctx: OrgContext, planCode: string, interval: BillingInterval) {
  requirePermission(ctx, "billing.manage");
  const plan = await db.plan.findUnique({ where: { code: planCode } });
  if (!plan || !plan.public) throw new NotFoundError("Plan not found.");
  if (plan.code === "FREE") throw new ValidationError("To move to the Free plan, cancel your current subscription.");
  const price = interval === "YEARLY" ? plan.stripeYearlyPriceId : plan.stripeMonthlyPriceId;
  if (!price) throw new ConfigurationError(`The ${plan.name} plan is not available for online checkout. Contact us to subscribe.`);
  const s = stripe();
  const sub = await db.subscription.findUnique({ where: { organizationId: ctx.org.id } });
  if (sub?.providerSubscriptionId && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(sub.status)) {
    // Existing Stripe subscription: plan changes go through the customer portal (handles proration).
    return openBillingPortal(ctx);
  }
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer: sub?.providerCustomerId ?? undefined,
    customer_email: sub?.providerCustomerId ? undefined : (ctx.org.contactEmail ?? ctx.actor.email),
    client_reference_id: ctx.org.id,
    subscription_data: { ...(plan.trialDays > 0 && !sub?.trialEndsAt ? { trial_period_days: plan.trialDays } : {}), metadata: { organizationId: ctx.org.id, planCode: plan.code } },
    metadata: { organizationId: ctx.org.id, planCode: plan.code },
    success_url: `${env.appUrl}/o/${ctx.org.slug}/admin/billing?checkout=success`,
    cancel_url: `${env.appUrl}/o/${ctx.org.slug}/admin/billing?checkout=cancelled`,
  });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "billing.checkout_started", metadata: { plan: plan.code, interval } });
  return session.url!;
}

export async function openBillingPortal(ctx: OrgContext) {
  requirePermission(ctx, "billing.manage");
  const sub = await db.subscription.findUnique({ where: { organizationId: ctx.org.id } });
  if (!sub?.providerCustomerId) throw new AppError("There is no online billing account for this community yet.");
  const portal = await stripe().billingPortal.sessions.create({ customer: sub.providerCustomerId, return_url: `${env.appUrl}/o/${ctx.org.slug}/admin/billing` });
  return portal.url;
}

export async function setCancelAtPeriodEnd(ctx: OrgContext, cancel: boolean) {
  requirePermission(ctx, "billing.manage");
  const sub = await db.subscription.findUnique({ where: { organizationId: ctx.org.id }, include: { plan: true } });
  if (!sub || sub.plan.code === "FREE") throw new ValidationError("There is no paid subscription to cancel.");
  if (sub.providerSubscriptionId && billingProviderName() === "stripe") {
    await stripe().subscriptions.update(sub.providerSubscriptionId, { cancel_at_period_end: cancel });
  }
  await db.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: cancel, canceledAt: cancel ? new Date() : null } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: cancel ? "billing.cancel_scheduled" : "billing.cancel_reverted" });
}

const MANUAL_STATUSES: SubscriptionStatus[] = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"];

/** Platform admin manual plan assignment (used while online billing is not configured, or for Enterprise). */
export async function assignPlanManually(admin: Actor, organizationId: string, input: { planCode: string; status: SubscriptionStatus; periodEnd?: Date | null; interval?: BillingInterval; note?: string }) {
  requirePlatformSuper(admin);
  if (!MANUAL_STATUSES.includes(input.status)) throw new ValidationError("Invalid status.");
  const plan = await db.plan.findUnique({ where: { code: input.planCode } });
  if (!plan) throw new NotFoundError("Plan not found.");
  const now = new Date();
  const data = {
    planId: plan.id,
    status: input.status,
    interval: input.interval ?? "MONTHLY",
    currentPeriodStart: now,
    currentPeriodEnd: input.periodEnd ?? null,
    trialEndsAt: input.status === "TRIALING" ? (input.periodEnd ?? new Date(now.getTime() + plan.trialDays * 86400_000)) : null,
    graceEndsAt: null,
    cancelAtPeriodEnd: false,
    canceledAt: input.status === "CANCELED" ? now : null,
    billingProvider: "manual",
  };
  await db.subscription.upsert({ where: { organizationId }, create: { ...data, organizationId }, update: data });
  await audit({ organizationId, actorId: admin.id, action: "platform.plan_assigned", metadata: { plan: plan.code, status: input.status, note: input.note ?? null } });
}

/** Scheduler: move lapsed subscriptions through grace → expired. */
export async function expireSubscriptions(now = new Date()) {
  const subs = await db.subscription.findMany({ where: { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED"] } }, include: { plan: true } });
  let changed = 0;
  for (const s of subs) {
    const next = nextLifecycleState(s, s.plan, now);
    if (next) {
      await db.subscription.update({ where: { id: s.id }, data: next });
      await audit({ organizationId: s.organizationId, action: "billing.status_changed", metadata: { from: s.status, to: next.status ?? s.status } });
      changed++;
    }
  }
  return changed;
}

/** Pure lifecycle rule (unit tested). Provider-managed subscriptions are driven by webhooks instead. */
export function nextLifecycleState(s: Pick<Subscription, "status" | "currentPeriodEnd" | "trialEndsAt" | "graceEndsAt" | "providerSubscriptionId" | "cancelAtPeriodEnd">, plan: Pick<Plan, "code" | "graceDays">, now: Date): Partial<Subscription> | null {
  if (plan.code === "FREE" || s.providerSubscriptionId) return null;
  if (s.status === "TRIALING" && s.trialEndsAt && s.trialEndsAt <= now) return { status: "EXPIRED" };
  if (s.status === "ACTIVE" && s.currentPeriodEnd && s.currentPeriodEnd <= now) {
    if (s.cancelAtPeriodEnd) return { status: "EXPIRED" };
    return { status: "PAST_DUE", graceEndsAt: new Date(s.currentPeriodEnd.getTime() + plan.graceDays * 86400_000) };
  }
  if (s.status === "PAST_DUE" && (!s.graceEndsAt || s.graceEndsAt <= now)) return { status: "EXPIRED" };
  if (s.status === "CANCELED" && (!s.currentPeriodEnd || s.currentPeriodEnd <= now)) return { status: "EXPIRED" };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Stripe Billing webhooks (separate endpoint and secret from Connect donations)
// ---------------------------------------------------------------------------------------------

const STRIPE_STATUS: Record<string, SubscriptionStatus> = {
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  unpaid: "PAST_DUE",
  canceled: "CANCELED",
  incomplete_expired: "EXPIRED",
  paused: "PAST_DUE",
};

function periodEnd(sub: Stripe.Subscription): Date | null {
  const raw = (sub as unknown as { current_period_end?: number }).current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  return raw ? new Date(raw * 1000) : null;
}

function periodStart(sub: Stripe.Subscription): Date {
  const raw = (sub as unknown as { current_period_start?: number }).current_period_start ?? sub.items?.data?.[0]?.current_period_start ?? sub.created;
  return new Date(raw * 1000);
}

async function syncStripeSubscription(sub: Stripe.Subscription) {
  const organizationId = sub.metadata?.organizationId;
  if (!organizationId) return;
  const priceId = sub.items.data[0]?.price.id;
  const plan = priceId ? await db.plan.findFirst({ where: { OR: [{ stripeMonthlyPriceId: priceId }, { stripeYearlyPriceId: priceId }] } }) : null;
  const status = STRIPE_STATUS[sub.status];
  if (!plan || !status) return;
  const end = periodEnd(sub);
  const data = {
    planId: plan.id,
    status,
    interval: plan.stripeYearlyPriceId === priceId ? ("YEARLY" as const) : ("MONTHLY" as const),
    currentPeriodStart: periodStart(sub),
    currentPeriodEnd: end,
    trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    graceEndsAt: status === "PAST_DUE" && end ? new Date(end.getTime() + plan.graceDays * 86400_000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    billingProvider: "stripe",
    providerCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    providerSubscriptionId: sub.id,
  };
  await db.subscription.upsert({ where: { organizationId }, create: { ...data, organizationId }, update: data });
}

export async function handleBillingWebhook(rawBody: string, signature: string | null) {
  const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
  if (!secret || !signature) throw new ForbiddenError("Invalid signature");
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw new ForbiddenError("Invalid signature");
  }
  try {
    await db.billingWebhookEvent.create({ data: { provider: "stripe", eventId: event.id, type: event.type } });
  } catch {
    return "duplicate";
  }
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncStripeSubscription(event.data.object);
      break;
    case "checkout.session.completed": {
      const s = event.data.object;
      if (s.mode === "subscription" && typeof s.subscription === "string") await syncStripeSubscription(await stripe().subscriptions.retrieve(s.subscription));
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.finalized": {
      const inv = event.data.object;
      const customer = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      const sub = customer ? await db.subscription.findFirst({ where: { providerCustomerId: customer }, include: { plan: true } }) : null;
      if (!sub) break;
      const status = event.type === "invoice.paid" ? "PAID" : inv.status === "uncollectible" ? "UNCOLLECTIBLE" : inv.status === "void" ? "VOID" : "OPEN";
      await db.subscriptionInvoice.upsert({
        where: { providerInvoiceId: inv.id! },
        create: {
          organizationId: sub.organizationId,
          providerInvoiceId: inv.id!,
          planCode: sub.plan.code,
          amount: inv.amount_due,
          currency: inv.currency.toUpperCase(),
          status,
          periodStart: inv.period_start ? new Date(inv.period_start * 1000) : null,
          periodEnd: inv.period_end ? new Date(inv.period_end * 1000) : null,
          hostedUrl: inv.hosted_invoice_url ?? null,
        },
        update: { status, hostedUrl: inv.hosted_invoice_url ?? null },
      });
      break;
    }
  }
  await db.billingWebhookEvent.update({ where: { provider_eventId: { provider: "stripe", eventId: event.id } }, data: { processedAt: new Date() } });
  return "processed";
}
