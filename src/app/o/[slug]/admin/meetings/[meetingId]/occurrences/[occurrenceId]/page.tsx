import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { getOccurrenceForManage } from "@/server/meetings/service";
import { db } from "@/server/db";
import { formatInZone } from "@/lib/time";
import { DateTime } from "luxon";
import { attendanceAction, cancelOccurrenceAction, postMeetingNoteAction, rescheduleOccurrenceAction } from "../../../../actions";

export default async function HostToolsPage({ params }: { params: Promise<{ slug: string; meetingId: string; occurrenceId: string }> }) {
  const { slug, occurrenceId } = await params;
  const ctx = await pageOrgContext(slug);
  const user = (await getCurrentUser())!;
  const o = await getOccurrenceForManage(ctx, occurrenceId).catch(() => notFound());
  const [attendance, intents, members] = await Promise.all([
    db.meetingAttendance.findMany({ where: { occurrenceId: o.id }, include: { user: { select: { name: true } } }, orderBy: { firstJoinedAt: "asc" } }),
    db.meetingJoinIntent.groupBy({ by: ["userId"], where: { occurrenceId: o.id } }),
    db.membership.findMany({ where: { organizationId: ctx.org.id, status: "ACTIVE" }, include: { user: { select: { id: true, name: true } } }, take: 1000 }),
  ]);
  const attended = new Set(attendance.map((a) => a.userId));
  const local = DateTime.fromJSDate(o.startsAt).setZone(o.meeting.timezone);
  return (
    <>
      <PageHeader
        eyebrow="Host tools"
        title={o.meeting.title}
        description={`${formatInZone(o.startsAt, user.timezone)} (${user.timezone})`}
        actions={
          <>
            <LinkButton href={`/o/${slug}/meetings/${o.id}`} variant="secondary">Member view</LinkButton>
            {o.meeting.mode !== "WHATSAPP" && <LinkButton href={`/o/${slug}/meetings/${o.id}/room`}>Open room</LinkButton>}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardTitle>Attendance</CardTitle>
          {o.meeting.mode === "WHATSAPP" ? (
            <p className="mt-1 text-sm text-muted">The platform cannot see who joins a WhatsApp call. {intents.length} member{intents.length === 1 ? "" : "s"} clicked “Join on WhatsApp” — that is not proof of attendance. Mark people who actually attended below.</p>
          ) : (
            <p className="mt-1 text-sm text-muted">Recorded automatically from the meeting service when people join and leave.</p>
          )}
          {attendance.length > 0 && (
            <ul className="mt-3 divide-y divide-line text-sm">
              {attendance.map((a) => (
                <li key={a.id} className="flex justify-between py-2">
                  <span>{a.user.name}</span>
                  <span className="text-muted">{a.source === "HOST_MARKED" ? <Badge>host-marked</Badge> : `${Math.round(a.totalSeconds / 60)} min`}</span>
                </li>
              ))}
            </ul>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-plum-700">Mark attendance manually</summary>
            <ActionForm action={attendanceAction.bind(null, slug)} className="mt-3">
              <input type="hidden" name="occurrenceId" value={o.id} />
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {members.filter((m) => !attended.has(m.userId)).map((m) => (
                  <label key={m.userId} className="flex items-center gap-2 text-sm"><input type="checkbox" name="userId" value={m.userId} className="size-4" /> {m.user.name}</label>
                ))}
              </div>
              <SubmitButton size="sm">Record attendance</SubmitButton>
            </ActionForm>
          </details>
        </Card>
        <div className="space-y-6">
          {o.status === "SCHEDULED" && (
            <>
              <Card>
                <CardTitle>Reschedule this session</CardTitle>
                <ActionForm action={rescheduleOccurrenceAction.bind(null, slug)} className="mt-3">
                  <input type="hidden" name="occurrenceId" value={o.id} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <TextField label="Date" name="date" type="date" defaultValue={local.toISODate()!} required />
                    <TextField label={`Time (${o.meeting.timezone})`} name="time" type="time" defaultValue={local.toFormat("HH:mm")} required />
                    <TextField label="Minutes" name="durationMinutes" type="number" defaultValue={String(o.meeting.durationMinutes)} />
                  </div>
                  <SubmitButton variant="secondary">Reschedule & notify</SubmitButton>
                </ActionForm>
              </Card>
              <Card>
                <CardTitle>Cancel this session</CardTitle>
                <ActionForm action={cancelOccurrenceAction.bind(null, slug)} className="mt-3">
                  <input type="hidden" name="occurrenceId" value={o.id} />
                  <TextField label="Reason (shared with members)" name="reason" />
                  <SubmitButton variant="danger">Cancel & notify</SubmitButton>
                </ActionForm>
              </Card>
            </>
          )}
          <Card>
            <CardTitle>Post-meeting announcement</CardTitle>
            <ActionForm action={postMeetingNoteAction.bind(null, slug)} className="mt-3">
              <input type="hidden" name="occurrenceId" value={o.id} />
              <TextAreaField label="Shown on the session page" name="note" rows={4} defaultValue={o.postMeetingNote ?? ""} />
              <SubmitButton variant="secondary">Save note</SubmitButton>
            </ActionForm>
          </Card>
          <Link href={`/o/${slug}/admin/meetings/${o.meetingId}`} className="text-sm text-plum-700 underline">← Back to meeting</Link>
        </div>
      </div>
    </>
  );
}
