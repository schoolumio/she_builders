import Link from "next/link";
import { ArrowRight, CalendarDays, HandHeart, Megaphone } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InlineAction } from "@/components/ui/inline-action";
import { pageOrgContext } from "@/server/page";
import { listGroups } from "@/server/groups/service";
import { can } from "@/server/tenancy/context";
import { groupMembershipAction } from "../actions";

export const metadata = { title: "Groups" };

export default async function GroupsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug);
  const groups = await listGroups(ctx);
  return (
    <>
      <PageHeader title="Groups" description="Smaller circles inside the community — a prayer team, a department, a city or a cell." />

      <Card className="mb-6 bg-canvas">
        <p className="font-semibold text-plum-900">How groups work</p>
        <ul className="mt-3 grid gap-3 text-sm text-ink/80 sm:grid-cols-3">
          <li className="flex gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0 text-plum-700" aria-hidden /> Leaders schedule meetings just for the group. They appear on the group page and your dashboard.</li>
          <li className="flex gap-2"><HandHeart className="mt-0.5 size-4 shrink-0 text-plum-700" aria-hidden /> Share a prayer request with only your group by choosing it when you ask for prayer.</li>
          <li className="flex gap-2"><Megaphone className="mt-0.5 size-4 shrink-0 text-plum-700" aria-hidden /> Announcements and programmes can be aimed at one group instead of everyone.</li>
        </ul>
        {can(ctx, "groups.manage") && (
          <p className="mt-3 text-sm text-muted">
            You can create groups and add members in <Link href={`/o/${slug}/admin/groups`} className="font-medium text-plum-700 underline">Admin → Groups</Link>.
          </p>
        )}
      </Card>

      {groups.length === 0 ? <EmptyState title="No groups yet" /> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g) => {
            const mine = g.members.length > 0;
            return (
              <Card key={g.id} className="flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/o/${slug}/groups/${g.id}`} className="font-semibold text-plum-900 hover:underline">{g.name}</Link>
                  {mine && <Badge tone="success">{g.members[0]!.role === "LEADER" ? "Leader" : "Member"}</Badge>}
                </div>
                {g.description && <p className="mt-1 text-sm text-muted">{g.description}</p>}
                <p className="mt-2 text-xs text-muted">{g._count.members} {g._count.members === 1 ? "member" : "members"}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                  <Link href={`/o/${slug}/groups/${g.id}`} className="inline-flex items-center gap-1 rounded-full bg-plum-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-plum-800">
                    Open group <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  <InlineAction action={groupMembershipAction.bind(null, slug)} fields={{ groupId: g.id, op: mine ? "leave" : "join" }} variant={mine ? "ghost" : "secondary"}>
                    {mine ? "Leave" : "Join group"}
                  </InlineAction>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
