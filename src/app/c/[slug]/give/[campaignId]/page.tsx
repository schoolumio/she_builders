import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Notice } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { LinkButton } from "@/components/ui/button";
import { ActionForm, CheckboxField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { AmountPicker } from "@/components/amount-picker";
import { getCurrentUser } from "@/server/auth/current-user";
import { campaignTotals, getCampaignForGiving, isCampaignOpen } from "@/server/payments/campaigns";
import { donationReadiness } from "@/server/payments/connections";
import { NotFoundError } from "@/server/errors";
import { formatMoney, fromMinorUnits } from "@/lib/money";
import { startDonationAction } from "../../actions";

export const metadata = { title: "Give" };

export default async function GivePage({ params }: { params: Promise<{ slug: string; campaignId: string }> }) {
  const { slug, campaignId } = await params;
  const user = await getCurrentUser();
  const { campaign: c } = await getCampaignForGiving(slug, campaignId, user?.id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [totals, ready] = await Promise.all([campaignTotals(c.id), donationReadiness(c.organizationId, c.currency)]);
  const open = isCampaignOpen(c);
  const canGive = open && ready.ready && (user || c.allowGuests);
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <Link href={`/c/${slug}`} className="flex items-center gap-3">
          <Avatar name={c.organization.name} src={c.organization.logoUrl} size={40} />
          <span className="font-semibold text-plum-900">{c.organization.name}</span>
        </Link>
        {c.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.imageUrl} alt="" className="mt-6 aspect-video w-full rounded-[var(--radius-card)] object-cover" />
        )}
        <h1 className="mt-6 font-serif text-3xl font-semibold text-plum-900">{c.title}</h1>
        {c.beneficiary && <p className="mt-1 text-sm text-muted">Beneficiary: {c.beneficiary} (as stated by the organisation)</p>}
        <p className="mt-4 whitespace-pre-line">{c.description}</p>
        {c.targetAmount && (
          <div className="mt-6">
            <p className="text-sm"><strong>{formatMoney(totals.raised, c.currency)}</strong> confirmed of {formatMoney(c.targetAmount, c.currency)}</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-violet-100" role="progressbar" aria-valuemin={0} aria-valuemax={c.targetAmount} aria-valuenow={totals.raised}><div className="h-full bg-gold-500" style={{ width: `${Math.min(100, (totals.raised / c.targetAmount) * 100)}%` }} /></div>
          </div>
        )}
        {c.updates.length > 0 && (
          <div className="mt-8"><h2 className="font-semibold text-plum-900">Updates</h2><ul className="mt-2 space-y-2 text-sm">{c.updates.map((u) => <li key={u.id} className="border-l-2 border-gold-500 pl-3">{u.body}</li>)}</ul></div>
        )}
        <p className="mt-8 text-xs text-muted">This campaign is run by {c.organization.name}. Its purpose and beneficiary are described by the organisation and have not been independently audited by BridgeCodes. <Link href="/fundraising-disclosures" className="underline">Fundraising disclosures</Link></p>
      </div>
      <Card className="h-fit lg:sticky lg:top-6">
        {!open ? (
          <Notice tone="warning">This campaign is not accepting donations right now.</Notice>
        ) : !ready.ready ? (
          <Notice tone="warning" title="Donations are not available yet">{ready.reason}</Notice>
        ) : !user && !c.allowGuests ? (
          <div className="space-y-3">
            <p className="text-sm">Please sign in to give to this campaign.</p>
            <LinkButton href={`/login?next=/c/${slug}/give/${c.id}`} className="w-full">Sign in</LinkButton>
          </div>
        ) : null}
        {canGive && (
          <ActionForm action={startDonationAction.bind(null, slug, c.id)}>
            <h2 className="font-semibold text-plum-900">Choose an amount ({c.currency})</h2>
            <AmountPicker suggestions={c.suggestedAmounts.map((a) => fromMinorUnits(a, c.currency))} currency={c.currency} allowCustom={c.allowCustomAmount} min={fromMinorUnits(c.minAmount, c.currency)} max={fromMinorUnits(c.maxAmount, c.currency)} />
            {!user && (
              <>
                <TextField label="Your name (optional)" name="donorName" autoComplete="name" />
                <TextField label="Email for your receipt" name="donorEmail" type="email" autoComplete="email" required />
              </>
            )}
            {c.allowAnonymous && <CheckboxField name="anonymous" label="Hide my name from the organisation's public lists" hint="The organisation's finance team can still see your receipt details." />}
            <TextAreaField label="Message (optional)" name="message" rows={2} maxLength={500} />
            <SubmitButton className="w-full" variant="gold" size="lg">Review donation</SubmitButton>
            <p className="text-xs text-muted">You&apos;ll see the recipient, any fees and the payment provider before paying.</p>
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
