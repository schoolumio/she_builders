import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InlineAction } from "@/components/ui/inline-action";
import { pageOrgContext } from "@/server/page";
import { getProgramme, PROGRAMME_TYPE_LABELS } from "@/server/programmes/service";
import { NotFoundError } from "@/server/errors";
import { activityCompletionAction, programmeEnrollmentAction } from "../../actions";

export default async function ProgrammePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await pageOrgContext(slug);
  const { programme: p, enrollment, completed, currentDay } = await getProgramme(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const done = completed.size;
  return (
    <>
      <PageHeader
        eyebrow={PROGRAMME_TYPE_LABELS[p.type]}
        title={p.title}
        description={`Starts ${p.startDate} · ${p.durationDays} days${p.group ? ` · ${p.group.name}` : ""}`}
        actions={
          p.status === "PUBLISHED" ? (
            <InlineAction action={programmeEnrollmentAction.bind(null, slug)} fields={{ programmeId: p.id, op: enrollment ? "leave" : "enroll" }} variant={enrollment ? "ghost" : "primary"}>
              {enrollment ? "Leave programme" : "Join programme"}
            </InlineAction>
          ) : <Badge tone="warning">Draft — only administrators can see this</Badge>
        }
      />
      {p.description && <p className="mb-6 max-w-3xl whitespace-pre-line text-sm">{p.description}</p>}
      {enrollment && p.trackCompletion && (
        <div className="mb-6">
          <p className="text-sm text-muted">{done} of {p.activities.length} activities completed</p>
          <div className="mt-1 h-2 max-w-md overflow-hidden rounded-full bg-violet-100" role="progressbar" aria-valuemin={0} aria-valuemax={p.activities.length} aria-valuenow={done}>
            <div className="h-full bg-gold-500" style={{ width: `${p.activities.length ? (done / p.activities.length) * 100 : 0}%` }} />
          </div>
        </div>
      )}
      <ol className="space-y-3">
        {p.activities.map((a) => {
          const isDone = completed.has(a.id);
          return (
            <li key={a.id}>
              <Card className={a.dayNumber === currentDay ? "border-gold-500" : ""}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gold-600">Day {a.dayNumber}{a.dayNumber === currentDay ? " · Today" : ""}</p>
                  {isDone && <Badge tone="success">Completed</Badge>}
                </div>
                <h2 className="mt-1 font-semibold text-plum-900">{a.title}</h2>
                {a.scriptureRefs.length > 0 && <p className="mt-1 text-sm text-gold-600">{a.scriptureRefs.join(" · ")}</p>}
                {a.body && <p className="mt-2 whitespace-pre-line text-sm">{a.body}</p>}
                {a.reflectionQuestions.length > 0 && (
                  <div className="mt-3 rounded-lg bg-violet-50 p-3">
                    <p className="text-xs font-semibold text-plum-800">Reflect</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{a.reflectionQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                  </div>
                )}
                {a.resourceUrl && <a href={a.resourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-plum-700 underline">Open resource ↗</a>}
                {enrollment && p.trackCompletion && (
                  <div className="mt-3">
                    <InlineAction action={activityCompletionAction.bind(null, slug)} fields={{ programmeId: p.id, activityId: a.id, complete: isDone ? "0" : "1" }} variant={isDone ? "ghost" : "secondary"}>
                      {isDone ? "Mark as not done" : "Mark as done"}
                    </InlineAction>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
    </>
  );
}
