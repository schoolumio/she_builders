import { notFound } from "next/navigation";
import { Card, Notice } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { pageOrgContext } from "@/server/page";
import { getOccurrenceForMember } from "@/server/meetings/service";
import { classifyWhatsAppLink, WHATSAPP_KIND_LABEL } from "@/lib/urls";
import { joinWhatsAppAction } from "../../../actions";

export const metadata = { title: "Leaving for WhatsApp" };

export default async function WhatsAppInterstitial({ params }: { params: Promise<{ slug: string; occurrenceId: string }> }) {
  const { slug, occurrenceId } = await params;
  const ctx = await pageOrgContext(slug);
  const { occurrence } = await getOccurrenceForMember(ctx, occurrenceId).catch(() => notFound());
  const link = occurrence.meeting.externalUrl ? classifyWhatsAppLink(occurrence.meeting.externalUrl) : null;
  if (occurrence.meeting.mode !== "WHATSAPP") notFound();
  const host = occurrence.meeting.externalUrl ? new URL(occurrence.meeting.externalUrl).hostname : null;
  return (
    <Card className="mx-auto max-w-lg p-6">
      <h1 className="font-serif text-2xl font-semibold text-plum-900">You&apos;re about to leave {ctx.org.name}</h1>
      <p className="mt-3 text-sm">
        This meeting takes place on WhatsApp. We&apos;ll open <strong>{host ?? "an external link"}</strong> in WhatsApp or your browser. WhatsApp&apos;s own terms and privacy policy apply there.
      </p>
      {link ? <Notice className="mt-4">{WHATSAPP_KIND_LABEL[link.kind]}</Notice> : <Notice tone="warning" className="mt-4">This link is not a recognised WhatsApp address. Only continue if you trust it.</Notice>}
      {occurrence.meeting.externalInstructions && <p className="mt-4 whitespace-pre-line rounded-lg bg-canvas p-3 text-sm">{occurrence.meeting.externalInstructions}</p>}
      <ActionForm action={joinWhatsAppAction.bind(null, slug)} className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="occurrenceId" value={occurrence.id} />
        <SubmitButton variant="gold" pendingText="Opening…">Continue to WhatsApp</SubmitButton>
        <LinkButton href={`/o/${slug}/meetings/${occurrence.id}`} variant="secondary">Stay here</LinkButton>
      </ActionForm>
    </Card>
  );
}
