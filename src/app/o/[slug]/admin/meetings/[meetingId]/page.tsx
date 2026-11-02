import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle, Notice, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { MeetingForm } from "@/components/meeting-form";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { loadMeetingForManage } from "@/server/meetings/service";
import { db } from "@/server/db";
import { can } from "@/server/tenancy/context";
import { formatInZone } from "@/lib/time";
import { daysAgo } from "@/lib/clock";
import { meetingFormData } from "../data";
import { cancelSeriesAction, updateMeetingAction } from "../../actions";

export default async function EditMeetingPage({ params, searchParams }: { params: Promise<{ slug: string; meetingId: string }>; searchParams: Promise<{ created?: string }> }) {
  const { slug, meetingId } = await params;
  const { created } = await searchParams;
  const ctx = await pageOrgContext(slug, ["meetings.create", "meetings.manage"]);
  const user = (await getCurrentUser())!;
  const m = await loadMeetingForManage(ctx, meetingId).catch(() => notFound());
  const [data, occurrences] = await Promise.all([
    meetingFormData(ctx),
    db.meetingOccurrence.findMany({ where: { meetingId: m.id, endsAt: { gte: daysAgo(7) } }, orderBy: { startsAt: "asc" }, take: 20, include: { _count: { select: { attendances: true } } } }),
  ]);
  const agenda = m.agendaItems.map((a) => [a.title, a.details ?? "", a.scriptureRef ?? "", a.durationMinutes ?? ""].join(" | ").replace(/( \| )+$/, "")).join("\n");
  return (
    <>
      <PageHeader title={m.title} eyebrow="Manage meeting" actions={<Badge tone={m.status === "ACTIVE" ? "success" : "danger"}>{m.status.toLowerCase()}</Badge>} />
      {created && <Notice tone="success" className="mb-6">Meeting created. Members who can see it will find it under Meetings.</Notice>}
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardTitle>Details</CardTitle>
          <div className="mt-4">
            <MeetingForm
              action={updateMeetingAction.bind(null, slug)}
              {...data}
              canChooseHosts={can(ctx, "meetings.manage")}
              submitLabel="Save changes"
              defaults={{
                ...m,
                meetingId: m.id,
                hostIds: m.hosts.filter((h) => h.role === "HOST").map((h) => h.userId),
                coHostIds: m.hosts.filter((h) => h.role === "CO_HOST").map((h) => h.userId),
                inviteeIds: m.invitees.map((i) => i.userId),
                agenda,
              }}
            />
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardTitle>Upcoming sessions</CardTitle>
            {occurrences.length === 0 ? <p className="mt-2 text-sm text-muted">No sessions scheduled yet. Recurring sessions are generated up to 90 days ahead.</p> : (
              <ul className="mt-2 divide-y divide-line">
                {occurrences.map((o) => (
                  <li key={o.id}>
                    <Link href={`/o/${slug}/admin/meetings/${m.id}/occurrences/${o.id}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:bg-violet-50">
                      <span className={o.status === "CANCELLED" ? "text-muted line-through" : ""}>{formatInZone(o.startsAt, user.timezone)}</span>
                      <span className="flex gap-1">
                        {o.rescheduled && <Badge tone="gold">moved</Badge>}
                        {o._count.attendances > 0 && <Badge tone="success">{o._count.attendances} attended</Badge>}
                        {o.status !== "SCHEDULED" && <Badge>{o.status.toLowerCase()}</Badge>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {m.status === "ACTIVE" && (
            <Card className="border-danger/30">
              <CardTitle className="text-danger">Cancel this meeting</CardTitle>
              <p className="mt-1 text-sm text-muted">Cancels all future sessions and notifies members.</p>
              <ActionForm action={cancelSeriesAction.bind(null, slug)} className="mt-3">
                <input type="hidden" name="meetingId" value={m.id} />
                <TextField label="Reason (shared with members)" name="reason" />
                <SubmitButton variant="danger">Cancel all future sessions</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
