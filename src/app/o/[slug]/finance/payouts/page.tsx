import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { listSettlements } from "@/server/payments/settlements";
import { activeConnection } from "@/server/payments/connections";
import { getPaymentProvider } from "@/server/payments/providers";
import { can } from "@/server/tenancy/context";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/time";
import { importPayoutsAction } from "../actions";

export const metadata = { title: "Payouts" };

const TONE = { PENDING: "warning", PAID: "success", FAILED: "danger", CANCELED: "neutral" } as const;

export default async function PayoutsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug, "finance.view");
  const user = (await getCurrentUser())!;
  const [rows, conn] = await Promise.all([listSettlements(ctx), activeConnection(ctx.org.id)]);
  const provider = conn ? getPaymentProvider(conn.provider) : null;
  return (
    <>
      <PageHeader
        title="Payouts"
        description="Transfers from your payment provider to your organisation's bank account, as reported by the provider."
        actions={
          can(ctx, "finance.manage") && conn ? (
            <ActionForm action={importPayoutsAction.bind(null, slug)} className="space-y-2">
              <SubmitButton variant="secondary" pendingText="Importing…">Import from {provider?.displayName}</SubmitButton>
            </ActionForm>
          ) : undefined
        }
      />
      {!conn && <Notice tone="warning" className="mb-4">Connect a payment account to see payouts.</Notice>}
      {provider && !provider.capabilities.settlements && <Notice tone="warning" className="mb-4">{provider.displayName} payouts cannot be imported automatically.</Notice>}
      {conn && <p className="mb-4 text-xs text-muted">Last imported: {conn.lastSettlementSyncAt ? formatInZone(conn.lastSettlementSyncAt, user.timezone) : "never"}. Payouts are also refreshed automatically every few hours.</p>}
      {rows.length === 0 ? <EmptyState title="No payouts imported yet" /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-canvas text-left text-muted"><tr><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Amount</th><th className="px-4 py-2 font-medium">Fees at payout</th><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2 font-medium">Provider reference</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-2">{formatInZone(r.settledAt ?? r.expectedAt ?? r.createdAt, user.timezone, "d LLL yyyy")}{!r.settledAt && r.expectedAt && <span className="block text-xs text-muted">expected</span>}</td>
                  <td className="px-4 py-2 font-medium">{formatMoney(r.amount, r.currency)}</td>
                  <td className="px-4 py-2">{r.feeAmount == null ? "—" : formatMoney(r.feeAmount, r.currency)}</td>
                  <td className="px-4 py-2"><Badge tone={TONE[r.status]}>{r.status.toLowerCase()}</Badge></td>
                  <td className="px-4 py-2 font-mono text-xs">{r.providerSettlementId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
