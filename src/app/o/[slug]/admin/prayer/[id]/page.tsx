import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { InlineAction } from "@/components/ui/inline-action";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { getPrayerRequest } from "@/server/prayer/service";
import { prayerAuthorLabel } from "@/server/prayer/access";
import { db } from "@/server/db";
import { formatInZone } from "@/lib/time";
import { assignPrayerAction, moderatePrayerAction, unassignPrayerAction } from "../../actions";

export default async function PrayerCareDetail({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await pageOrgContext(slug, ["prayer.view_confidential", "prayer.moderate"]);
  const user = (await getCurrentUser())!;
  const { request: r, canAssign, canModerate } = await getPrayerRequest(ctx, id).catch(() => notFound());
  const members = canAssign ? await db.membership.findMany({ where: { organizationId: ctx.org.id, status: "ACTIVE" }, include: { user: { select: { id: true, name: true } } } }) : [];
  return (
    <>
      <PageHeader eyebrow="Prayer care" title={r.title} description={`${prayerAuthorLabel(r, r.author.name, user.id)} · ${r.visibility.toLowerCase()} · ${formatInZone(r.createdAt, user.timezone)}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <p className="whitespace-pre-line">{r.body}</p>
          {r.updates.map((u) => <p key={u.id} className="mt-3 border-l-2 border-gold-500 pl-3 text-sm">{u.body}</p>)}
          {canModerate && r.visibility !== "PRIVATE" && (
            <div className="mt-4 flex gap-2">
              <InlineAction action={moderatePrayerAction.bind(null, slug)} fields={{ id: r.id, decision: "APPROVED" }}>Approve</InlineAction>
              <InlineAction action={moderatePrayerAction.bind(null, slug)} fields={{ id: r.id, decision: "HIDDEN" }} variant="ghost">Hide</InlineAction>
            </div>
          )}
        </Card>
        {canAssign && (
          <Card>
            <CardTitle>Prayer team</CardTitle>
            <p className="mt-1 text-sm text-muted">Assigned members can read this request and receive follow-up reminders.</p>
            <ul className="mt-3 space-y-2">
              {r.assignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span>{a.user.name}{a.followUpAt ? ` · follow up ${formatInZone(a.followUpAt, user.timezone, "d LLL")}` : ""}</span>
                  <InlineAction action={unassignPrayerAction.bind(null, slug)} fields={{ id: r.id, userId: a.userId }} variant="ghost">Remove</InlineAction>
                </li>
              ))}
            </ul>
            <ActionForm action={assignPrayerAction.bind(null, slug)} className="mt-4">
              <input type="hidden" name="id" value={r.id} />
              <SelectField label="Assign to" name="userId" options={members.filter((m) => m.userId !== r.authorId).map((m) => ({ value: m.userId, label: m.user.name }))} />
              <TextField label="Follow-up reminder (optional)" name="followUpAt" type="datetime-local" />
              <SubmitButton size="sm">Assign</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
      <Link href={`/o/${slug}/admin/prayer`} className="mt-6 inline-block text-sm text-plum-700 underline">← Prayer care</Link>
    </>
  );
}
