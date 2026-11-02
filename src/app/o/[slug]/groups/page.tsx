import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InlineAction } from "@/components/ui/inline-action";
import { pageOrgContext } from "@/server/page";
import { listGroups } from "@/server/groups/service";
import { groupMembershipAction } from "../actions";

export const metadata = { title: "Groups" };

export default async function GroupsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug);
  const groups = await listGroups(ctx);
  return (
    <>
      <PageHeader title="Groups" description="Join groups to see their meetings, requests and announcements." />
      {groups.length === 0 ? <EmptyState title="No groups yet" /> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => {
            const mine = g.members.length > 0;
            return (
              <Card key={g.id}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-plum-900">{g.name}</p>
                  {mine && <Badge tone="success">{g.members[0]!.role === "LEADER" ? "Leader" : "Member"}</Badge>}
                </div>
                {g.description && <p className="mt-1 text-sm text-muted">{g.description}</p>}
                <p className="mt-2 text-xs text-muted">{g._count.members} members</p>
                <div className="mt-3">
                  <InlineAction action={groupMembershipAction.bind(null, slug)} fields={{ groupId: g.id, op: mine ? "leave" : "join" }} variant={mine ? "ghost" : "secondary"}>
                    {mine ? "Leave group" : "Join group"}
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
