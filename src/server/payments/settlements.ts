import "server-only";
import type { PaymentProviderConnection, SettlementStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { db } from "../db";
import { AppError, NotFoundError } from "../errors";
import { audit } from "../audit";
import { errorMeta, log } from "../log";
import { rateLimit } from "../rate-limit";
import type { OrgContext } from "../tenancy/context";
import { requirePermission } from "../tenancy/context";
import { getPaymentProvider } from "./providers";
import { ProviderError, type ProviderSettlement } from "./types";

const STATUS: Record<ProviderSettlement["status"], SettlementStatus> = { pending: "PENDING", paid: "PAID", failed: "FAILED", canceled: "CANCELED" };

/** Upserts one provider payout. Records are matched on (provider, providerSettlementId), so re-imports are idempotent. */
export async function applySettlement(conn: Pick<PaymentProviderConnection, "id" | "organizationId" | "provider">, s: ProviderSettlement) {
  const status = STATUS[s.status];
  const existing = await db.settlementRecord.findUnique({ where: { provider_providerSettlementId: { provider: conn.provider, providerSettlementId: s.providerSettlementId } } });
  if (existing && existing.organizationId !== conn.organizationId) {
    // A payout id can only ever belong to one organisation's account.
    log.error("settlement.org_mismatch", { settlementId: existing.id });
    return "mismatch" as const;
  }
  const data = {
    amount: s.amount,
    feeAmount: s.feeAmount,
    currency: s.currency.toUpperCase(),
    status,
    providerStatus: s.providerStatus.slice(0, 40),
    expectedAt: s.expectedAt,
    settledAt: s.settledAt ?? (status === "PAID" ? (existing?.settledAt ?? new Date()) : null),
  };
  if (existing) {
    await db.settlementRecord.update({ where: { id: existing.id }, data });
    return existing.status === status ? ("unchanged" as const) : ("updated" as const);
  }
  await db.settlementRecord.create({ data: { ...data, organizationId: conn.organizationId, connectionId: conn.id, provider: conn.provider, providerSettlementId: s.providerSettlementId } });
  return "created" as const;
}

export async function importSettlementsForConnection(conn: PaymentProviderConnection, since?: Date) {
  const provider = getPaymentProvider(conn.provider);
  if (!provider.capabilities.settlements || !provider.listSettlements || !provider.isAvailable() || !conn.providerAccountId) return { created: 0, updated: 0, skipped: true };
  const from = since ?? DateTime.now().minus({ days: 90 }).toJSDate();
  const rows = await provider.listSettlements({ accountId: conn.providerAccountId, since: from });
  let created = 0;
  let updated = 0;
  for (const s of rows) {
    const r = await applySettlement(conn, s);
    if (r === "created") created++;
    if (r === "updated") updated++;
  }
  await db.paymentProviderConnection.update({ where: { id: conn.id }, data: { lastSettlementSyncAt: new Date() } });
  return { created, updated, skipped: false };
}

/** Finance admin "Import payouts" button. */
export async function importSettlements(ctx: OrgContext) {
  requirePermission(ctx, "finance.manage");
  await rateLimit(`settlements:import:${ctx.org.id}`, 10, 3600);
  const conns = await db.paymentProviderConnection.findMany({ where: { organizationId: ctx.org.id, providerAccountId: { not: null } } });
  if (conns.length === 0) throw new NotFoundError("Connect a payment account first.");
  let created = 0;
  let updated = 0;
  for (const c of conns) {
    try {
      const r = await importSettlementsForConnection(c);
      created += r.created;
      updated += r.updated;
    } catch (e) {
      if (e instanceof ProviderError) throw new AppError(e.userMessage);
      throw e;
    }
  }
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "payments.settlements_imported", metadata: { created, updated } });
  return { created, updated };
}

/** Scheduler: refresh payouts for verified connections at most every 6 hours. */
export async function scheduledSettlementImport(now = new Date()) {
  const stale = DateTime.fromJSDate(now).minus({ hours: 6 }).toJSDate();
  const conns = await db.paymentProviderConnection.findMany({
    where: { status: { in: ["VERIFIED", "RESTRICTED", "DISCONNECTED"] }, providerAccountId: { not: null }, OR: [{ lastSettlementSyncAt: null }, { lastSettlementSyncAt: { lt: stale } }] },
    take: 50,
  });
  let changed = 0;
  for (const c of conns) {
    try {
      const r = await importSettlementsForConnection(c, c.lastSettlementSyncAt ? DateTime.fromJSDate(c.lastSettlementSyncAt).minus({ days: 14 }).toJSDate() : undefined);
      changed += r.created + r.updated;
    } catch (e) {
      log.warn("settlements.import_failed", { connectionId: c.id, ...errorMeta(e) });
    }
  }
  return changed;
}

export async function listSettlements(ctx: OrgContext) {
  requirePermission(ctx, "finance.view");
  return db.settlementRecord.findMany({ where: { organizationId: ctx.org.id }, orderBy: [{ settledAt: "desc" }, { createdAt: "desc" }], take: 500 });
}

/** Paid-out totals by currency (only payouts the provider reports as PAID). */
export async function settledTotals(organizationId: string) {
  const rows = await db.settlementRecord.groupBy({ by: ["currency", "status"], where: { organizationId }, _sum: { amount: true } });
  const out = new Map<string, { paid: number; pending: number }>();
  for (const r of rows) {
    const t = out.get(r.currency) ?? { paid: 0, pending: 0 };
    if (r.status === "PAID") t.paid += r._sum.amount ?? 0;
    if (r.status === "PENDING") t.pending += r._sum.amount ?? 0;
    out.set(r.currency, t);
  }
  return out;
}
