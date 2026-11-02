import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle, Notice, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SelectField, SubmitButton, TextAreaField } from "@/components/ui/form";
import { InlineAction } from "@/components/ui/inline-action";
import { ReportButton } from "@/components/report-button";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { getPrayerRequest } from "@/server/prayer/service";
import { prayerAuthorLabel, VISIBILITY_EXPLANATION } from "@/server/prayer/access";
import { NotFoundError } from "@/server/errors";
import { formatInZone } from "@/lib/time";
import { acknowledgePrayerAction, deletePrayerAction, updatePrayerAction } from "../../actions";

export default async function PrayerRequestPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { slug, id } = await params;
  const { created } = await searchParams;
  const ctx = await pageOrgContext(slug);
  const user = (await getCurrentUser())!;
  const data = await getPrayerRequest(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { request: r, isAuthor, canModerate, canAssign } = data;
  return (
    <>
      <PageHeader eyebrow="Prayer request" title={r.title} description={`${prayerAuthorLabel(r, r.author.name, user.id)} · ${formatInZone(r.createdAt, user.timezone)}`} />
      {created && <Notice tone="success" className="mb-4">Your request has been shared. {r.moderationStatus === "PENDING" ? "It will appear to others once a moderator approves it." : ""}</Notice>}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap gap-2">
              <Badge tone="violet">{r.visibility === "PRIVATE" ? "Private" : r.visibility === "GROUP" ? `Group: ${r.group?.name ?? ""}` : "Whole community"}</Badge>
              {r.moderationStatus !== "APPROVED" && <Badge tone="warning">{r.moderationStatus === "PENDING" ? "Awaiting review" : "Not shared with others"}</Badge>}
              {r.status === "ANSWERED" && <Badge tone="success">Answered 🙏</Badge>}
              {r.status === "CLOSED" && <Badge>Closed</Badge>}
            </div>
            <p className="mt-4 whitespace-pre-line">{r.body}</p>
            <p className="mt-4 text-xs text-muted">{VISIBILITY_EXPLANATION[r.visibility]}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {!isAuthor && r.moderationStatus === "APPROVED" && (
                <InlineAction action={acknowledgePrayerAction.bind(null, slug)} fields={{ id: r.id }} variant={r.acknowledgements.length ? "secondary" : "primary"}>
                  {r.acknowledgements.length ? "You prayed 🙏" : "I prayed for this"}
                </InlineAction>
              )}
              <span className="text-sm text-muted">{r._count.acknowledgements} {r._count.acknowledgements === 1 ? "person has" : "people have"} prayed</span>
            </div>
          </Card>
          {r.updates.length > 0 && (
            <Card>
              <CardTitle>Updates</CardTitle>
              <ul className="mt-3 space-y-3">
                {r.updates.map((u) => (
                  <li key={u.id} className="border-l-2 border-gold-500 pl-3">
                    <p className="whitespace-pre-line text-sm">{u.body}</p>
                    <p className="text-xs text-muted">{formatInZone(u.createdAt, user.timezone)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {isAuthor && (
            <Card>
              <CardTitle>Update your request</CardTitle>
              <ActionForm action={updatePrayerAction.bind(null, slug)} className="mt-3" resetOnSuccess>
                <input type="hidden" name="id" value={r.id} />
                <TextAreaField label="Share an update (optional)" name="body" rows={3} />
                <SelectField label="Status" name="status" defaultValue={r.status} options={[{ value: "OPEN", label: "Still praying" }, { value: "ANSWERED", label: "Answered" }, { value: "CLOSED", label: "Closed" }]} />
                <SubmitButton>Save</SubmitButton>
              </ActionForm>
              <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-line pt-4">
                <Link href={`/o/${slug}/testimonies?from=${r.id}`} className="text-sm text-plum-700 underline">Share a testimony about this</Link>
                <InlineAction action={deletePrayerAction.bind(null, slug)} fields={{ id: r.id }} variant="danger" confirm="Delete this prayer request permanently?">Delete request</InlineAction>
              </div>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          {(canAssign || r.assignments.length > 0) && (canModerate || canAssign) && (
            <Card>
              <CardTitle>Prayer team</CardTitle>
              {r.assignments.length === 0 ? <p className="mt-2 text-sm text-muted">Not assigned.</p> : (
                <ul className="mt-2 space-y-1 text-sm">{r.assignments.map((a) => <li key={a.id}>{a.user.name}{a.followUpAt ? ` · follow up ${formatInZone(a.followUpAt, user.timezone, "d LLL")}` : ""}</li>)}</ul>
              )}
              {canAssign && <Link href={`/o/${slug}/admin/prayer/${r.id}`} className="mt-3 inline-block text-sm text-plum-700 underline">Manage in prayer care</Link>}
            </Card>
          )}
          {canModerate && !canAssign && (
            <Card><Link href={`/o/${slug}/admin/prayer`} className="text-sm text-plum-700 underline">Open moderation queue</Link></Card>
          )}
          <div className="flex justify-between">
            <Link href={`/o/${slug}/prayer`} className="text-sm text-plum-700 underline">← All requests</Link>
            {!isAuthor && <ReportButton slug={slug} targetType="PRAYER_REQUEST" targetId={r.id} />}
          </div>
        </div>
      </div>
    </>
  );
}
