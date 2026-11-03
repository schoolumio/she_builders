import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { Card, Notice } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { InlineAction } from "@/components/ui/inline-action";
import { DonationStatusBadge } from "@/components/donation-status";
import { AutoRefresh } from "@/components/auto-refresh";
import { requireUser } from "@/server/auth/current-user";
import { getRecurringByReference, INTERVAL_LABEL } from "@/server/payments/recurring";
import { getPaymentProvider } from "@/server/payments/providers";
import { brand } from "@/config/brand";
import { formatMoney, platformFee } from "@/lib/money";
import { formatInZone } from "@/lib/time";
import { cancelRecurringAction, payRecurringAction } from "../../../c/[slug]/actions";

export const metadata = { title: "Recurring gift", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS = { PENDING_SETUP: ["Not set up yet", "warning"], ACTIVE: ["Active", "success"], PAST_DUE: ["Payment failed — retrying", "danger"], CANCELED: ["Cancelled", "neutral"] } as const;

export default async function RecurringPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const { reference } = await params;
  const { cancelled } = await searchParams;
  const user = await requireUser(`/donations/recurring/${reference}`);
  const r = await getRecurringByReference(reference, user.id).catch(() => notFound());
  const provider = getPaymentProvider(r.provider);
  const m = (v: number) => formatMoney(v, r.currency);
  const every = INTERVAL_LABEL[r.interval];
  const [label, tone] = STATUS[r.status];
  return (
    <div className="min-h-dvh px-4 py-6">
      <BrandMark />
      <main id="main" className="mx-auto mt-8 max-w-lg">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-serif text-2xl font-semibold text-plum-900">{r.status === "PENDING_SETUP" && !r.checkoutUrl ? `Review your ${every} gift` : `Your ${every} gift`}</h1>
            <Badge tone={tone}>{label}</Badge>
          </div>
          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">Recipient</dt><dd className="text-right font-semibold">{r.organization.name}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Campaign</dt><dd className="text-right">{r.campaign.title}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Amount</dt><dd className="text-right text-lg font-semibold">{m(r.amount)} {every}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Platform fee</dt><dd className="text-right">{r.platformFeeBps ? `${m(platformFee(r.amount, r.platformFeeBps))} of each payment (kept by ${brand.companyName})` : "None"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Payment processing</dt><dd className="text-right">Charged by {provider.displayName} to the recipient</dd></div>
            {r.nextChargeAt && r.status !== "CANCELED" && <div className="flex justify-between gap-3"><dt className="text-muted">Next payment (estimated)</dt><dd className="text-right">{formatInZone(r.nextChargeAt, user.timezone, "d LLL yyyy")}</dd></div>}
          </dl>
          {provider.isTestMode() && <Notice tone="warning" className="mt-4" title="Test mode">No real money will move.</Notice>}

          {r.status === "PENDING_SETUP" && !r.checkoutUrl && (
            <>
              <p className="mt-4 text-xs text-muted">
                {provider.displayName} will charge {m(r.amount)} {every} until you cancel. You can cancel at any time from My giving; payments already made are not refunded automatically. <Link href="/fundraising-disclosures" className="underline">Fundraising disclosures</Link>
              </p>
              <ActionForm action={payRecurringAction.bind(null, r.reference)} className="mt-6">
                <SubmitButton variant="gold" size="lg" className="w-full" pendingText="Opening secure payment…">Continue to secure payment</SubmitButton>
              </ActionForm>
            </>
          )}
          {r.status === "PENDING_SETUP" && r.checkoutUrl && (
            <>
              <Notice className="mt-4">{cancelled ? "It looks like set-up was cancelled. If you completed it, this page will update shortly." : "Waiting for the payment provider to confirm your recurring gift."}</Notice>
              <AutoRefresh seconds={5} maxTimes={24} />
              <a href={r.checkoutUrl} className="mt-3 inline-block text-sm text-plum-700 underline">Return to the payment page</a>
            </>
          )}
          {r.status === "PAST_DUE" && <Notice tone="danger" className="mt-4">{r.failureReason ?? "The last payment failed."} The provider may retry automatically.</Notice>}
          {r.status === "CANCELED" && r.canceledAt && <p className="mt-4 text-sm text-muted">Cancelled on {formatInZone(r.canceledAt, user.timezone, "d LLL yyyy")}{r.canceledBy === "organisation" ? " by the organisation" : r.canceledBy === "provider" ? " by the payment provider" : ""}.</p>}

          {r.charges.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-plum-900">Payments</p>
              <ul className="mt-2 divide-y divide-line text-sm">
                {r.charges.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/donations/${c.reference}`} className="underline">{formatInZone(c.createdAt, user.timezone, "d LLL yyyy")}</Link>
                    <span className="flex items-center gap-2">{m(c.amount)} <DonationStatusBadge status={c.status} /></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            {(r.status === "ACTIVE" || r.status === "PAST_DUE") && <InlineAction action={cancelRecurringAction} fields={{ id: r.id }} variant="danger" confirm={`Cancel your ${every} gift to ${r.organization.name}?`}>Cancel recurring gift</InlineAction>}
            <LinkButton href="/app/donations" variant="secondary">My giving</LinkButton>
          </div>
        </Card>
      </main>
    </div>
  );
}
