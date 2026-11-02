import { notFound } from "next/navigation";
import { simulatorAllowed } from "@/server/payments/providers/simulator";

/** Development-only pages standing in for a payment provider's hosted onboarding and checkout. */
export default function SimulatorLayout({ children }: { children: React.ReactNode }) {
  if (!simulatorAllowed()) notFound();
  return (
    <div className="min-h-dvh bg-[repeating-linear-gradient(45deg,#fdf1d8,#fdf1d8_12px,#faf7f2_12px,#faf7f2_24px)] px-4 py-10">
      <main id="main" className="mx-auto max-w-md rounded-xl border-2 border-dashed border-warning bg-white p-6 shadow">
        <p className="text-xs font-bold uppercase tracking-wider text-warning">Payment simulator · test only · no real money</p>
        {children}
      </main>
    </div>
  );
}
