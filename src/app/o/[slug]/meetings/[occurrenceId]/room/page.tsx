import { notFound } from "next/navigation";
import { pageOrgContext } from "@/server/page";
import { getOccurrenceForMember } from "@/server/meetings/service";
import { listGifts } from "@/server/gifts/service";
import { MeetingRoom } from "@/components/room/meeting-room";
import { Notice } from "@/components/ui/card";
import { getRealtimeProvider } from "@/server/realtime";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Meeting room" };

export default async function RoomPage({ params }: { params: Promise<{ slug: string; occurrenceId: string }> }) {
  const { slug, occurrenceId } = await params;
  const ctx = await pageOrgContext(slug);
  const { occurrence: o, canManage } = await getOccurrenceForMember(ctx, occurrenceId).catch(() => notFound());
  if (o.meeting.mode === "WHATSAPP") notFound();
  if (!getRealtimeProvider().isConfigured()) {
    return <Notice tone="warning" title="In-app meetings are not configured">The real-time meeting service has not been set up on this platform yet.</Notice>;
  }
  const gifts = o.meeting.giftsEnabled ? await listGifts(ctx.org.id) : [];
  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-my-8 lg:mx-0 lg:overflow-hidden lg:rounded-[var(--radius-card)]">
      <MeetingRoom
        slug={slug}
        occurrenceId={o.id}
        title={o.meeting.title}
        mode={o.meeting.mode}
        format={o.meeting.format}
        chatEnabled={o.meeting.chatEnabled}
        giftsEnabled={o.meeting.giftsEnabled}
        canManage={canManage}
        theme={o.meeting.theme}
        scriptureRefs={o.meeting.scriptureRefs}
        agenda={o.meeting.agendaItems.map((a) => ({ id: a.id, title: a.title, details: a.details, scriptureRef: a.scriptureRef, durationMinutes: a.durationMinutes }))}
        gifts={gifts
          .filter((g) => !g.priceAmount || ctx.org.paidGiftsEnabled)
          .map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, price: g.priceAmount && g.currency ? formatMoney(g.priceAmount, g.currency) : null }))}
        backHref={`/o/${slug}/meetings/${o.id}`}
      />
    </div>
  );
}
