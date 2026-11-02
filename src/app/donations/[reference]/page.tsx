import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { Card, Notice } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { DonationStatusBadge } from "@/components/donation-status";
import { AutoRefresh } from "@/components/auto-refresh";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDonationByReference } from "@/server/payments/donations";
import { reconcileDonation } from "@/server/payments/events";
import { getPaymentProvider } from "@/server/payments/providers";
import { errorMeta, log } from "@/server/log";
import { brand } from "@/config/brand";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/time";
import { payDonationAction } from "../../c/[slug]/actions";

export const metadata = { title: "Your donation", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DonationPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const { reference } = await params;
  const { cancelled } = await searchParams;
  const user = await getCurrentUser();
  let d = await getDonationByReference(reference, user?.id).catch(() => notFound());

  // Returning from the provider: ask the provider directly. The redirect itself proves nothing.
  if (d.checkoutUrl && (d.status === "PENDING" || d.status === "ABANDONED")) {
    try {
      if ((await reconcileDonation(d.reference)) === "processed") d = await getDonationByReference(reference, user?.id);
    } catch (e) {
      log.warn("donation.reconcile_failed", { reference: d.reference, ...errorMeta(e) });
    }
  }
  const provider = getPaymentProvider(d.provider);
  const m = (v: number) => formatMoney(v, d.currency);
  const label = d.purpose === "GIFT" ? "gift" : "donation";

  return (
    <div className="min-h-dvh px-4 py-6">
      <BrandMark />
      <main id="main" className="mx-auto mt-8 max-w-lg">
        <Card className="p-6">
          {d.status === "PENDING" && !d.checkoutUrl ? (
            <>
              <h1 className="font-serif text-2xl font-semibold text-plum-900">Review your {label}</h1>
              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted">Recipient</dt><dd className="text-right font-semibold">{d.organization.name}</dd></div>
                {d.campaign && <div className="flex justify-between gap-3"><dt className="text-muted">Campaign</dt><dd className="text-right">{d.campaign.title}</dd></div>}
                <div className="flex justify-between gap-3"><dt className="text-muted">Amount</dt><dd className="text-right text-lg font-semibold">{m(d.amount)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Platform fee</dt><dd className="text-right">{d.platformFeeAmount ? `${m(d.platformFeeAmount)} (kept by ${brand.companyName}, from your ${label})` : "None"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Payment processing</dt><dd className="text-right">Charged by {provider.displayName} to the recipient</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">You will be charged</dt><dd className="text-right font-semibold">{m(d.amount)}</dd></div>
              </dl>
              {provider.isTestMode() && <Notice tone="warning" className="mt-4" title="Test mode">This is a test payment. No real money will move.</Notice>}
              <p className="mt-4 text-xs text-muted">
                Your payment goes to {d.organization.name} through {provider.displayName}. {brand.companyName} provides the software and does not hold these funds.
                {d.purpose === "GIFT" ? " Virtual gifts are not charitable donations." : " This confirmation is not a tax receipt unless the organisation says so."}{" "}
                <Link href="/fundraising-disclosures" className="underline">Fundraising disclosures</Link>
              </p>
              {d.campaign?.terms && <p className="mt-3 whitespace-pre-line rounded-lg bg-canvas p-3 text-xs">{d.campaign.terms}</p>}
              <ActionForm action={payDonationAction.bind(null, d.reference)} className="mt-6">
                <SubmitButton variant="gold" size="lg" className="w-full" pendingText="Opening secure payment…">Continue to secure payment</SubmitButton>
              </ActionForm>
              <Link href={`/c/${d.organization.slug}`} className="mt-3 block text-center text-sm text-muted underline">Cancel</Link>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <h1 className="font-serif text-2xl font-semibold text-plum-900">
                  {d.status === "SUCCEEDED" || d.status === "PARTIALLY_REFUNDED" ? "Thank you!" : d.status === "PENDING" ? "Waiting for confirmation" : d.status === "FAILED" ? "Payment not completed" : "Your " + label}
                </h1>
                <DonationStatusBadge status={d.status} />
              </div>
              {d.status === "PENDING" && (
                <>
                  <Notice className="mt-4">{cancelled ? "It looks like the payment was cancelled. If you did complete it, the status will update shortly." : "We're waiting for the payment provider to confirm your payment. This usually takes a few seconds."}</Notice>
                  <AutoRefresh seconds={5} maxTimes={24} />
                  <a href={d.checkoutUrl!} className="mt-3 inline-block text-sm text-plum-700 underline">Return to the payment page</a>
                </>
              )}
              {d.status === "FAILED" && <Notice tone="danger" className="mt-4">{d.failureReason ?? "The payment provider reported that the payment failed."} No money was taken for this attempt.</Notice>}
              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted">Recipient</dt><dd className="font-semibold">{d.organization.name}</dd></div>
                {d.campaign && <div className="flex justify-between gap-3"><dt className="text-muted">Campaign</dt><dd>{d.campaign.title}</dd></div>}
                <div className="flex justify-between gap-3"><dt className="text-muted">Amount</dt><dd>{m(d.amount)}</dd></div>
                {d.amountRefunded > 0 && <div className="flex justify-between gap-3"><dt className="text-muted">Refunded</dt><dd>{m(d.amountRefunded)}</dd></div>}
                {d.receiptNumber && <div className="flex justify-between gap-3"><dt className="text-muted">Receipt number</dt><dd className="font-mono">{d.receiptNumber}</dd></div>}
                {d.paidAt && <div className="flex justify-between gap-3"><dt className="text-muted">Confirmed</dt><dd>{formatInZone(d.paidAt, user?.timezone ?? "UTC")}</dd></div>}
                <div className="flex justify-between gap-3"><dt className="text-muted">Provider</dt><dd>{provider.displayName} {provider.isTestMode() && <Badge tone="gold">test</Badge>}</dd></div>
              </dl>
              {(d.status === "SUCCEEDED" || d.status === "PARTIALLY_REFUNDED") && <p className="mt-4 text-xs text-muted">Confirmed by {provider.displayName}. {d.donorEmail ? "A receipt has been emailed to you." : ""} Keep this page&apos;s address as your record.</p>}
              <div className="mt-6 flex flex-wrap gap-2">
                <LinkButton href={`/c/${d.organization.slug}`} variant="secondary">Back to {d.organization.name}</LinkButton>
                {d.status === "FAILED" && d.campaign && <LinkButton href={`/c/${d.organization.slug}/give/${d.campaign.id}`}>Try again</LinkButton>}
              </div>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
