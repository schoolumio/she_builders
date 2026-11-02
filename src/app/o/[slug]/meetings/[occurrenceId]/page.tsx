import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle, Notice, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MODE_LABEL } from "@/components/occurrence-list";
import { ReportButton } from "@/components/report-button";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { getOccurrenceForMember, isOccurrenceJoinable } from "@/server/meetings/service";
import { describeRecurrence } from "@/server/meetings/recurrence";
import { getRealtimeProvider } from "@/server/realtime";
import { NotFoundError } from "@/server/errors";
import { formatInZone } from "@/lib/time";
import { classifyWhatsAppLink, WHATSAPP_KIND_LABEL } from "@/lib/urls";

export default async function OccurrencePage({ params }: { params: Promise<{ slug: string; occurrenceId: string }> }) {
  const { slug, occurrenceId } = await params;
  const ctx = await pageOrgContext(slug);
  const user = (await getCurrentUser())!;
  const res = await getOccurrenceForMember(ctx, occurrenceId).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { occurrence: o, canManage } = res;
  const m = o.meeting;
  const joinable = isOccurrenceJoinable(o, new Date(), canManage ? 30 : 15);
  const wa = m.externalUrl ? classifyWhatsAppLink(m.externalUrl) : null;
  const rtConfigured = getRealtimeProvider().isConfigured();

  return (
    <>
      <PageHeader
        eyebrow={MODE_LABEL[m.mode]}
        title={m.title}
        description={
          <>
            {formatInZone(o.startsAt, user.timezone)} – {formatInZone(o.endsAt, user.timezone, "HH:mm")} ({user.timezone})
            {user.timezone !== m.timezone && <span className="block">Scheduled as {formatInZone(o.startsAt, m.timezone, "ccc HH:mm")} {m.timezone}</span>}
          </>
        }
        actions={canManage ? <LinkButton href={`/o/${slug}/admin/meetings/${m.id}/occurrences/${o.id}`} variant="secondary">Host tools</LinkButton> : undefined}
      />
      {o.status === "CANCELLED" && <Notice tone="danger" title="This session has been cancelled" className="mb-6">{o.cancelReason}</Notice>}
      {o.rescheduled && o.status !== "CANCELLED" && <Notice tone="warning" className="mb-6">This session was rescheduled.</Notice>}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardTitle>Join</CardTitle>
            {o.status === "CANCELLED" ? (
              <p className="mt-2 text-sm text-muted">There is nothing to join.</p>
            ) : m.mode === "WHATSAPP" ? (
              <div className="mt-3 space-y-3">
                {wa && <p className="text-sm text-muted">{WHATSAPP_KIND_LABEL[wa.kind]}</p>}
                {m.externalInstructions && <p className="whitespace-pre-line rounded-lg bg-canvas p-3 text-sm">{m.externalInstructions}</p>}
                {m.externalUrl ? (
                  <LinkButton href={`/o/${slug}/meetings/${o.id}/whatsapp`} variant="gold">Join on WhatsApp</LinkButton>
                ) : (
                  <p className="text-sm text-muted">Follow the instructions above to join.</p>
                )}
                <p className="text-xs text-muted">WhatsApp meetings happen outside this platform, so attendance is only recorded if a host marks it.</p>
              </div>
            ) : !rtConfigured ? (
              <Notice tone="warning" className="mt-3" title="In-app meetings are not available yet">The platform&apos;s real-time meeting service has not been configured. Please contact your community administrators.</Notice>
            ) : joinable ? (
              <div className="mt-3 space-y-2">
                <LinkButton href={`/o/${slug}/meetings/${o.id}/room`} size="lg">Join {m.mode === "VIDEO" ? "video" : "audio"} meeting</LinkButton>
                <p className="text-xs text-muted">Your browser will ask for microphone{m.mode === "VIDEO" ? " and camera" : ""} access. {m.format === "BROADCAST" && !canManage ? "You'll join as a listener; raise your hand to ask to speak." : ""}</p>
              </div>
            ) : o.status === "ENDED" || o.endsAt < new Date() ? (
              <p className="mt-2 text-sm text-muted">This session has ended.</p>
            ) : (
              <p className="mt-2 text-sm text-muted">The room opens 15 minutes before the start time.</p>
            )}
          </Card>
          {(m.description || m.theme || m.scriptureRefs.length > 0) && (
            <Card>
              <CardTitle>About this meeting</CardTitle>
              {m.theme && <p className="mt-2 text-sm"><span className="font-medium">Theme:</span> {m.theme}</p>}
              {m.scriptureRefs.length > 0 && <p className="mt-1 text-sm text-gold-600">{m.scriptureRefs.join(" · ")}</p>}
              {m.description && <p className="mt-3 whitespace-pre-line text-sm">{m.description}</p>}
            </Card>
          )}
          {o.postMeetingNote && (
            <Card>
              <CardTitle>After the meeting</CardTitle>
              <p className="mt-2 whitespace-pre-line text-sm">{o.postMeetingNote}</p>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardTitle>Prayer agenda</CardTitle>
            {m.agendaItems.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No agenda has been shared.</p>
            ) : (
              <ol className="mt-3 space-y-3">
                {m.agendaItems.map((a, i) => (
                  <li key={a.id} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-plum-800">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium">{a.title}{a.durationMinutes ? <span className="text-muted"> · {a.durationMinutes} min</span> : null}</p>
                      {a.details && <p className="text-sm text-muted">{a.details}</p>}
                      {a.scriptureRef && <p className="text-xs text-gold-600">{a.scriptureRef}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card>
            <CardTitle>Details</CardTitle>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Schedule</dt><dd>{describeRecurrence(m)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Format</dt><dd>{m.mode === "WHATSAPP" ? "External" : m.format === "BROADCAST" ? "Hosts speak, others listen" : "Interactive"}</dd></div>
              {m.group && <div className="flex justify-between gap-3"><dt className="text-muted">Group</dt><dd>{m.group.name}</dd></div>}
              <div className="flex justify-between gap-3"><dt className="text-muted">Status</dt><dd><Badge tone={o.status === "LIVE" ? "success" : "neutral"}>{o.status.toLowerCase()}</Badge></dd></div>
            </dl>
            <a href={`/api/orgs/${slug}/calendar.ics?occurrence=${o.id}`} className="mt-3 inline-block text-sm text-plum-700 underline">Add to calendar</a>
          </Card>
          <div className="flex items-center justify-between">
            <Link href={`/o/${slug}/meetings`} className="text-sm text-plum-700 underline">← All meetings</Link>
            <ReportButton slug={slug} targetType="MEETING" targetId={m.id} />
          </div>
        </div>
      </div>
    </>
  );
}
