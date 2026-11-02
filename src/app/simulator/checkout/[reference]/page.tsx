import { db } from "@/server/db";
import { formatMoney } from "@/lib/money";
import { simulatePayment } from "../../actions";

export default async function SimCheckout({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ return?: string; cancel?: string }> }) {
  const { reference } = await params;
  const sp = await searchParams;
  const d = await db.donation.findUnique({ where: { reference }, include: { organization: { select: { name: true } } } });
  if (!d) return <p className="mt-4">Unknown payment.</p>;
  return (
    <>
      <h1 className="mt-2 text-xl font-semibold">Simulated checkout</h1>
      <p className="mt-2 text-sm">Pay <strong>{formatMoney(d.amount, d.currency)}</strong> to <strong>{d.organization.name}</strong>.</p>
      <form action={simulatePayment} className="mt-6 space-y-3">
        <input type="hidden" name="reference" value={reference} />
        <input type="hidden" name="return" value={sp.return ?? "/"} />
        <input type="hidden" name="cancel" value={sp.cancel ?? "/"} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="deliverWebhook" defaultChecked className="size-4" /> Deliver signed webhook (uncheck to test server-side verification on return)</label>
        <div className="flex flex-col gap-2">
          <button name="outcome" value="succeeded" className="rounded-lg bg-success px-4 py-3 font-semibold text-white">Pay successfully</button>
          <button name="outcome" value="pending" className="rounded-lg border border-line px-4 py-3 font-semibold">Leave pending</button>
          <button name="outcome" value="failed" className="rounded-lg bg-danger px-4 py-3 font-semibold text-white">Decline card</button>
        </div>
      </form>
    </>
  );
}
