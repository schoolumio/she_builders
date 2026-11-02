import { notFound } from "next/navigation";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { InlineAction } from "@/components/ui/inline-action";
import { pageOrgContext } from "@/server/page";
import { db } from "@/server/db";
import { programmeProgress } from "@/server/programmes/service";
import { todayInZone } from "@/lib/time";
import { ProgrammeFields } from "../form";
import { deleteActivityAction, programmeStatusAction, saveActivityAction, saveProgrammeAction } from "../../actions";

export default async function EditProgrammePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await pageOrgContext(slug, "programmes.manage");
  const p = await db.programme.findFirst({ where: { id, organizationId: ctx.org.id }, include: { activities: { orderBy: { dayNumber: "asc" } } } });
  if (!p) notFound();
  const [groups, progress] = await Promise.all([db.communityGroup.findMany({ where: { organizationId: ctx.org.id, archivedAt: null } }), programmeProgress(ctx, p.id)]);
  const nextDay = Math.min(p.durationDays, (p.activities.at(-1)?.dayNumber ?? 0) + 1);
  const status = programmeStatusAction.bind(null, slug);
  return (
    <>
      <PageHeader
        title={p.title}
        eyebrow="Programme"
        actions={
          <>
            <Badge tone={p.status === "PUBLISHED" ? "success" : "warning"}>{p.status.toLowerCase()}</Badge>
            {p.status !== "PUBLISHED" && <InlineAction action={status} fields={{ programmeId: p.id, status: "PUBLISHED" }} variant="primary">Publish</InlineAction>}
            {p.status === "PUBLISHED" && <InlineAction action={status} fields={{ programmeId: p.id, status: "DRAFT" }}>Unpublish</InlineAction>}
            {p.status !== "ARCHIVED" && <InlineAction action={status} fields={{ programmeId: p.id, status: "ARCHIVED" }} variant="ghost">Archive</InlineAction>}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <div className="space-y-6">
          <Card>
            <CardTitle>Details</CardTitle>
            <ActionForm action={saveProgrammeAction.bind(null, slug)} className="mt-3">
              <input type="hidden" name="id" value={p.id} />
              <ProgrammeFields p={p} groups={groups} today={todayInZone(ctx.org.timezone)} />
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <CardTitle>Participation</CardTitle>
            {progress.length === 0 ? <p className="mt-2 text-sm text-muted">Nobody has joined yet.</p> : (
              <ul className="mt-2 space-y-1 text-sm">{progress.map((e) => <li key={e.id} className="flex justify-between"><span>{e.user.name}</span><span className="text-muted">{e._count.completions}/{p.activities.length} done</span></li>)}</ul>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardTitle>Add or replace a day</CardTitle>
            <p className="mt-1 text-xs text-muted">Write your own content or quote materials you are licensed to use. Saving a day number that already exists replaces it.</p>
            <ActionForm action={saveActivityAction.bind(null, slug)} className="mt-3" resetOnSuccess>
              <input type="hidden" name="programmeId" value={p.id} />
              <TextField label="Day" name="dayNumber" type="number" min={1} max={p.durationDays} defaultValue={String(nextDay)} required />
              <TextField label="Title" name="title" required />
              <TextAreaField label="Scripture references" name="scriptureRefs" rows={2} hint="One per line" />
              <TextAreaField label="Reading / devotional text" name="body" rows={5} />
              <TextAreaField label="Reflection questions" name="reflectionQuestions" rows={3} hint="One per line" />
              <TextField label="Resource link (audio, video, PDF)" name="resourceUrl" type="url" placeholder="https://" />
              <SubmitButton>Save day</SubmitButton>
            </ActionForm>
          </Card>
          {p.activities.map((a) => (
            <Card key={a.id} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-gold-600">Day {a.dayNumber}</p>
                <p className="font-medium">{a.title}</p>
                {a.scriptureRefs.length > 0 && <p className="text-xs text-muted">{a.scriptureRefs.join(" · ")}</p>}
              </div>
              <InlineAction action={deleteActivityAction.bind(null, slug)} fields={{ programmeId: p.id, activityId: a.id }} variant="ghost" confirm="Delete this day?">Delete</InlineAction>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
