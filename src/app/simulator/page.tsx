import { db } from "@/server/db";
import { formatMoney } from "@/lib/money";
import { simulatePayout, simulatePayoutStatus, simulateSubscriptionEvent } from "./actions";

export const dynamic = "force-dynamic";

type Sub = { id: string; reference: string; amount: number; currency: string; status: string; charges: number; interval: string };
type Payout = { providerSettlementId: string; amount: number; currency: string; status: string; accountId: string };

/** Development control panel: play the role of the payment provider. */
export default async function SimulatorHome() {
  const [subs, payouts, accounts] = await Promise.all([
    db.simulatorRecord.findMany({ where: { key: { startsWith: "subscription:" } }, orderBy: { updatedAt: "desc" }, take: 30 }),
    db.simulatorRecord.findMany({ where: { key: { startsWith: "payout:" } }, orderBy: { updatedAt: "desc" }, take: 30 }),
    db.paymentProviderConnection.findMany({ where: { provider: "SIMULATOR", providerAccountId: { not: null } }, include: { organization: { select: { name: true } } } }),
  ]);
  return (
    <div className="space-y-8">
      <h1 className="mt-2 text-xl font-semibold">Simulator control panel</h1>
      <section>
        <h2 className="font-semibold">Recurring gifts (subscriptions)</h2>
        {subs.length === 0 && <p className="text-sm">None yet. Start a monthly gift on a campaign that offers recurring giving.</p>}
        <ul className="mt-2 space-y-3">
          {subs.map((r) => {
            const s = r.data as unknown as Sub;
            return (
              <li key={s.id} className="rounded-lg border border-line p-3 text-sm">
                <p><code>{s.id}</code> · {formatMoney(s.amount, s.currency)} {s.interval.toLowerCase()} · <strong>{s.status}</strong> · {s.charges} charges</p>
                {s.status === "active" && (
                  <form action={simulateSubscriptionEvent} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="subscriptionId" value={s.id} />
                    <button name="op" value="charge" className="rounded bg-success px-3 py-1.5 text-white">Charge next period</button>
                    <button name="op" value="fail" className="rounded bg-danger px-3 py-1.5 text-white">Charge fails</button>
                    <button name="op" value="cancel" className="rounded border border-line px-3 py-1.5">Cancel at provider</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h2 className="font-semibold">Payouts</h2>
        <ul className="mt-2 space-y-2">
          {accounts.map((a) => (
            <li key={a.id} className="rounded-lg border border-line p-3 text-sm">
              <p>{a.organization.name} · <code>{a.providerAccountId}</code></p>
              <form action={simulatePayout} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="accountId" value={a.providerAccountId!} />
                <button name="status" value="pending" className="rounded border border-line px-3 py-1.5">Create payout (in transit)</button>
                <button name="status" value="paid" className="rounded bg-success px-3 py-1.5 text-white">Create payout (paid)</button>
              </form>
            </li>
          ))}
        </ul>
        <ul className="mt-3 space-y-2">
          {payouts.map((r) => {
            const p = r.data as unknown as Payout;
            return (
              <li key={p.providerSettlementId} className="flex flex-wrap items-center gap-2 text-sm">
                <code>{p.providerSettlementId}</code> {formatMoney(p.amount, p.currency)} <strong>{p.status}</strong>
                {p.status === "pending" && (
                  <form action={simulatePayoutStatus} className="flex gap-1">
                    <input type="hidden" name="payoutId" value={p.providerSettlementId} />
                    <button name="status" value="paid" className="rounded bg-success px-2 py-1 text-white">Mark paid (webhook)</button>
                    <button name="status" value="failed" className="rounded bg-danger px-2 py-1 text-white">Mark failed</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs">&ldquo;Create payout&rdquo; does not notify the app — use Finance → Payouts → Import to pull it in (the same way real providers are imported). &ldquo;Mark paid&rdquo; sends a signed webhook.</p>
      </section>
    </div>
  );
}
