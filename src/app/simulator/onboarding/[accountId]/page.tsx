import { simulateAccountDecision } from "../../actions";

export default async function SimOnboarding({ params, searchParams }: { params: Promise<{ accountId: string }>; searchParams: Promise<{ return?: string }> }) {
  const { accountId } = await params;
  const sp = await searchParams;
  return (
    <>
      <h1 className="mt-2 text-xl font-semibold">Simulated provider onboarding</h1>
      <p className="mt-2 text-sm">Account <code>{accountId}</code>. Choose the outcome the provider would report after KYC review.</p>
      <form action={simulateAccountDecision} className="mt-6 flex flex-col gap-2">
        <input type="hidden" name="accountId" value={accountId} />
        <input type="hidden" name="return" value={sp.return ?? "/"} />
        <button name="status" value="verified" className="rounded-lg bg-success px-4 py-3 font-semibold text-white">Approve (verified)</button>
        <button name="status" value="pending" className="rounded-lg border border-line px-4 py-3 font-semibold">Submit — pending review</button>
        <button name="status" value="restricted" className="rounded-lg bg-danger px-4 py-3 font-semibold text-white">Restrict account</button>
      </form>
    </>
  );
}
