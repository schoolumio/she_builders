import { db } from "@/server/db";
import { formatMoney } from "@/lib/money";
import { simulateSubscribe } from "../../actions";

export default async function SimSubscribe({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ return?: string; cancel?: string }> }) {
  const { reference } = await params;
  const sp = await searchParams;
  const r = await db.recurringDonation.findUnique({ where: { reference }, include: { organization: { select: { name: true } } } });
  if (!r) return <p className="mt-4">Unknown subscription.</p>;
  return (
    <>
      <h1 className="mt-2 text-xl font-semibold">Simulated recurring checkout</h1>
      <p className="mt-2 text-sm">
        Give <strong>{formatMoney(r.amount, r.currency)} {r.interval.toLowerCase()}</strong> to <strong>{r.organization.name}</strong>.
      </p>
      <form action={simulateSubscribe} className="mt-6 flex flex-col gap-2">
        <input type="hidden" name="reference" value={reference} />
        <input type="hidden" name="return" value={sp.return ?? "/"} />
        <input type="hidden" name="cancel" value={sp.cancel ?? "/"} />
        <button name="outcome" value="subscribe" className="rounded-lg bg-success px-4 py-3 font-semibold text-white">Start subscription (first payment succeeds)</button>
        <button name="outcome" value="cancel" className="rounded-lg border border-line px-4 py-3 font-semibold">Cancel</button>
      </form>
    </>
  );
}
