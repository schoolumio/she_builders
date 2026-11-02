import { Card, CardTitle, EmptyState, PageHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { InlineAction } from "@/components/ui/inline-action";
import { pageOrgContext } from "@/server/page";
import { db } from "@/server/db";
import { archiveGroupAction, groupMemberAction, saveGroupAction } from "../actions";

export const metadata = { title: "Groups" };

export default async function AdminGroupsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug, "groups.manage");
  const [groups, members] = await Promise.all([
    db.communityGroup.findMany({ where: { organizationId: ctx.org.id, archivedAt: null }, include: { members: { include: { user: { select: { id: true, name: true } } } } }, orderBy: { name: "asc" } }),
    db.membership.findMany({ where: { organizationId: ctx.org.id, status: "ACTIVE" }, include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Groups" description="Groups organise members for meetings, prayer requests, announcements and programmes." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card className="h-fit">
          <CardTitle>New group</CardTitle>
          <ActionForm action={saveGroupAction.bind(null, slug)} className="mt-3" resetOnSuccess>
            <TextField label="Name" name="name" required maxLength={80} />
            <TextAreaField label="Description" name="description" rows={2} />
            <SubmitButton>Create group</SubmitButton>
          </ActionForm>
        </Card>
        <div className="space-y-4">
          {groups.length === 0 && <EmptyState title="No groups yet" />}
          {groups.map((g) => {
            const inGroup = new Set(g.members.map((m) => m.userId));
            return (
              <Card key={g.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-plum-900">{g.name}</p>
                    {g.description && <p className="text-sm text-muted">{g.description}</p>}
                  </div>
                  <InlineAction action={archiveGroupAction.bind(null, slug)} fields={{ id: g.id }} variant="ghost" confirm="Archive this group?">Archive</InlineAction>
                </div>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {g.members.map((m) => (
                    <li key={m.id} className="flex items-center gap-1 rounded-full bg-violet-50 py-1 pl-3 pr-1 text-sm">
                      {m.user.name}{m.role === "LEADER" && " (leader)"}
                      <InlineAction action={groupMemberAction.bind(null, slug)} fields={{ groupId: g.id, userId: m.userId, op: "remove" }} variant="ghost">✕<span className="sr-only">Remove {m.user.name}</span></InlineAction>
                    </li>
                  ))}
                </ul>
                <ActionForm action={groupMemberAction.bind(null, slug)} className="mt-3 flex flex-col gap-2 space-y-0 sm:flex-row sm:items-end">
                  <input type="hidden" name="groupId" value={g.id} />
                  <input type="hidden" name="op" value="add" />
                  <label className="flex-1 text-sm">
                    <span className="sr-only">Member to add</span>
                    <select name="userId" className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm">
                      {members.filter((m) => !inGroup.has(m.userId)).map((m) => <option key={m.userId} value={m.userId}>{m.user.name}</option>)}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="sr-only">Group role</span>
                    <select name="role" className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm"><option value="MEMBER">Member</option><option value="LEADER">Leader</option></select>
                  </label>
                  <SubmitButton variant="secondary" size="sm">Add</SubmitButton>
                </ActionForm>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
