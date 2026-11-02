import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MODE_LABEL } from "@/components/occurrence-list";
import { pageOrgContext } from "@/server/page";
import { db } from "@/server/db";
import { can } from "@/server/tenancy/context";
import { describeRecurrence } from "@/server/meetings/recurrence";

export const metadata = { title: "Manage meetings" };

export default async function AdminMeetingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug, ["meetings.create", "meetings.manage"]);
  const meetings = await db.meeting.findMany({
    where: { organizationId: ctx.org.id, ...(can(ctx, "meetings.manage") ? {} : { hosts: { some: { userId: ctx.actor.id } } }) },
    include: { _count: { select: { occurrences: true } }, hosts: { include: { user: { select: { name: true } } } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return (
    <>
      <PageHeader title="Manage meetings" description={can(ctx, "meetings.manage") ? "All meetings in this community." : "Meetings you host."} actions={<LinkButton href={`/o/${slug}/admin/meetings/new`}>Schedule a meeting</LinkButton>} />
      {meetings.length === 0 ? <EmptyState title="No meetings yet" action={<LinkButton href={`/o/${slug}/admin/meetings/new`}>Schedule a meeting</LinkButton>} /> : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <Link key={m.id} href={`/o/${slug}/admin/meetings/${m.id}`} className="block">
              <Card className="flex flex-col gap-2 transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-plum-900">{m.title}</p>
                  <p className="text-sm text-muted">{describeRecurrence(m)} · {m.startTime} {m.timezone} · Hosts: {m.hosts.map((h) => h.user.name).join(", ")}</p>
                </div>
                <div className="flex gap-2">
                  <Badge tone="violet">{MODE_LABEL[m.mode]}</Badge>
                  {m.status !== "ACTIVE" && <Badge tone="danger">{m.status.toLowerCase()}</Badge>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
