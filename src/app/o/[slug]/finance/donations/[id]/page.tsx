import { notFound } from "next/navigation";
import { Card, CardTitle, Notice, PageHeader } from "@/components/ui/card";
import { DonationStatusBadge } from "@/components/donation-status";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { InlineAction } from "@/components/ui/inline-action";
import { pageOrgContext } from "@/server/page";
import { getDonationForFinance } from "@/server/payments/donations";
import { getCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/tenancy/context";
import { formatMoney, fromMinorUnits } from "@/lib/money";
import { formatInZone } from "@/lib/time";
import { reconcileAction, refundAction } from "../../actions";

export default async function DonationDetail({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await pageOrgContext(slug, "finance.view");
  const user = (await getCurrentUser())!;
  const d = await getDonationForFinance(ctx, id).catch(() => notFound());
  const refundable = d.amount - d.amountRefunded - d.refunds.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.amount, 0);
  const m = (v: number | null | undefined) => formatMoney(v, d.currency);
  return (
    <>
      <PageHeader title={m(d.amount)} eyebrow={d.purpose === "GIFT" ? "Paid gift" : "Donation"} actions={<DonationStatusBadge status={d.status} />} />
      {d.failureReason && <Notice tone={d.status === "FAILED" ? "danger" : "warning"} className="mb-4">{d.failureReason}</Notice>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Breakdown</CardTitle>
          <dl className="mt-3 space-y-1.5 text-sm">
            {[
              ["Amount donated", m(d.amount)],
              ["Amount charged (provider)", m(d.amountCharged)],
              ["Processing fee (provider)", m(d.processingFeeAmount)],
              ["Platform fee (disclosed)", m(d.platformFeeAmount)],
              ["Refunded", m(d.amountRefunded)],
              ["Net due to community", m(d.netAmount)],
            ].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
          </dl>
          <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">Donor</dt><dd>{d.anonymous ? "Anonymous (name hidden from public)" : (d.donorName ?? "Guest")}</dd></div>
            {d.donorEmail && <div className="flex justify-between gap-3"><dt className="text-muted">Receipt email</dt><dd>{d.donorEmail}</dd></div>}
            <div className="flex justify-between gap-3"><dt className="text-muted">Campaign</dt><dd>{d.campaign?.title ?? "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Provider</dt><dd>{d.provider}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Reference</dt><dd className="font-mono text-xs">{d.reference}</dd></div>
            {d.receiptNumber && <div className="flex justify-between gap-3"><dt className="text-muted">Receipt</dt><dd>{d.receiptNumber}</dd></div>}
            {d.paidAt && <div className="flex justify-between gap-3"><dt className="text-muted">Confirmed</dt><dd>{formatInZone(d.paidAt, user.timezone)}</dd></div>}
            {d.message && <div><dt className="text-muted">Message</dt><dd className="italic">“{d.message}”</dd></div>}
          </dl>
          {(d.status === "PENDING" || d.status === "ABANDONED") && <div className="mt-4"><InlineAction action={reconcileAction.bind(null, slug)} fields={{ id: d.id }}>Check status with provider</InlineAction></div>}
        </Card>
        <div className="space-y-6">
          {can(ctx, "finance.manage") && refundable > 0 && ["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(d.status) && (
            <Card>
              <CardTitle>Refund</CardTitle>
              <ActionForm action={refundAction.bind(null, slug)} className="mt-3">
                <input type="hidden" name="id" value={d.id} />
                <TextField label={`Amount (${d.currency})`} name="amount" type="number" step="0.01" max={fromMinorUnits(refundable, d.currency)} defaultValue={String(fromMinorUnits(refundable, d.currency))} required hint={`Up to ${m(refundable)}`} />
                <TextField label="Reason" name="reason" />
                <SubmitButton variant="danger">Request refund</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <Card>
            <CardTitle>Ledger</CardTitle>
            {d.ledgerEntries.length === 0 ? <p className="mt-2 text-sm text-muted">No confirmed financial movements yet.</p> : (
              <ul className="mt-2 divide-y divide-line text-sm">
                {d.ledgerEntries.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3 py-2"><span>{l.type.toLowerCase().replace("_", " ")}<span className="block text-xs text-muted">{formatInZone(l.createdAt, user.timezone, "d LLL yyyy HH:mm")}</span></span><span className={l.amount < 0 ? "text-danger" : "text-success"}>{m(l.amount)}</span></li>
                ))}
              </ul>
            )}
          </Card>
          {(d.refunds.length > 0 || d.disputes.length > 0) && (
            <Card>
              <CardTitle>Refunds & disputes</CardTitle>
              <ul className="mt-2 space-y-1 text-sm">
                {d.refunds.map((r) => <li key={r.id}>Refund {m(r.amount)} — {r.status.toLowerCase()}{r.reason ? ` (${r.reason})` : ""}</li>)}
                {d.disputes.map((x) => <li key={x.id}>Dispute {m(x.amount)} — {x.status.toLowerCase()}{x.reason ? ` (${x.reason})` : ""}</li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
