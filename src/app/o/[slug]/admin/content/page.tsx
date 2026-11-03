import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { InlineAction } from "@/components/ui/inline-action";
import { pageOrgContext } from "@/server/page";
import { db } from "@/server/db";
import { listPrayerPoints } from "@/server/content/service";
import { todayInZone } from "@/lib/time";
import { archiveAnnouncementAction, deletePrayerPointAction, saveAnnouncementAction, savePrayerPointAction } from "../actions";

export const metadata = { title: "Announcements & prayer points" };

export default async function ContentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ group?: string }> }) {
  const { group } = await searchParams;
  const { slug } = await params;
  const ctx = await pageOrgContext(slug, "content.publish");
  const [announcements, points, groups] = await Promise.all([
    db.announcement.findMany({ where: { organizationId: ctx.org.id, status: { not: "ARCHIVED" } }, orderBy: { createdAt: "desc" }, take: 30, include: { group: { select: { name: true } } } }),
    listPrayerPoints(ctx, { includeDrafts: true, take: 30 }),
    db.communityGroup.findMany({ where: { organizationId: ctx.org.id, archivedAt: null } }),
  ]);
  return (
    <>
      <PageHeader title="Announcements & prayer points" />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4" aria-labelledby="ann">
          <Card>
            <CardTitle as="h2"><span id="ann">New announcement</span></CardTitle>
            <ActionForm action={saveAnnouncementAction.bind(null, slug)} className="mt-3" resetOnSuccess>
              <TextField label="Title" name="title" required maxLength={160} />
              <TextAreaField label="Message" name="body" rows={5} required />
              <SelectField label="Audience" name="groupId" defaultValue={group ?? ""} options={[{ value: "", label: "Everyone" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} />
              <CheckboxField name="pinned" label="Pin to the top" />
              <CheckboxField name="publish" label="Publish now and notify members" hint="Leave unticked to save as a draft." />
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </Card>
          {announcements.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{a.title}</p>
                <Badge tone={a.status === "PUBLISHED" ? "success" : "warning"}>{a.status.toLowerCase()}</Badge>
                {a.group && <Badge tone="violet">{a.group.name}</Badge>}
                {a.pinned && <Badge tone="gold">pinned</Badge>}
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-plum-700">Edit</summary>
                <ActionForm action={saveAnnouncementAction.bind(null, slug)} className="mt-3">
                  <input type="hidden" name="id" value={a.id} />
                  <TextField label="Title" name="title" defaultValue={a.title} required />
                  <TextAreaField label="Message" name="body" defaultValue={a.body} rows={4} required />
                  <SelectField label="Audience" name="groupId" defaultValue={a.groupId ?? ""} options={[{ value: "", label: "Everyone" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} />
                  <CheckboxField name="pinned" label="Pinned" defaultChecked={a.pinned} />
                  {a.status !== "PUBLISHED" && <CheckboxField name="publish" label="Publish and notify members" />}
                  <SubmitButton size="sm">Save</SubmitButton>
                </ActionForm>
              </details>
              <div className="mt-2"><InlineAction action={archiveAnnouncementAction.bind(null, slug)} fields={{ id: a.id }} variant="ghost">Archive</InlineAction></div>
            </Card>
          ))}
        </section>
        <section className="space-y-4" aria-labelledby="pp">
          <Card>
            <CardTitle as="h2"><span id="pp">New prayer point</span></CardTitle>
            <ActionForm action={savePrayerPointAction.bind(null, slug)} className="mt-3" resetOnSuccess>
              <TextField label="For date" name="forDate" type="date" defaultValue={todayInZone(ctx.org.timezone)} required />
              <TextField label="Title" name="title" required />
              <TextAreaField label="Prayer focus" name="body" rows={5} required />
              <TextAreaField label="Scripture references" name="scriptureRefs" rows={2} hint="One per line. Quote only translations you are licensed to reproduce." />
              <CheckboxField name="publish" label="Publish" />
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </Card>
          {points.map((p) => (
            <Card key={p.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-gold-600">{p.forDate}</span>
                <p className="font-semibold">{p.title}</p>
                <Badge tone={p.status === "PUBLISHED" ? "success" : "warning"}>{p.status.toLowerCase()}</Badge>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-plum-700">Edit</summary>
                <ActionForm action={savePrayerPointAction.bind(null, slug)} className="mt-3">
                  <input type="hidden" name="id" value={p.id} />
                  <TextField label="For date" name="forDate" type="date" defaultValue={p.forDate} required />
                  <TextField label="Title" name="title" defaultValue={p.title} required />
                  <TextAreaField label="Prayer focus" name="body" defaultValue={p.body} rows={4} required />
                  <TextAreaField label="Scripture references" name="scriptureRefs" defaultValue={p.scriptureRefs.join("\n")} rows={2} />
                  {p.status !== "PUBLISHED" && <CheckboxField name="publish" label="Publish" />}
                  <SubmitButton size="sm">Save</SubmitButton>
                </ActionForm>
              </details>
              <div className="mt-2"><InlineAction action={deletePrayerPointAction.bind(null, slug)} fields={{ id: p.id }} variant="ghost" confirm="Delete this prayer point?">Delete</InlineAction></div>
            </Card>
          ))}
        </section>
      </div>
    </>
  );
}
