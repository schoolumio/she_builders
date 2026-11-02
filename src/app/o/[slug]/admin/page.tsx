import Link from "next/link";
import { Card, CardTitle, Notice, PageHeader, Stat } from "@/components/ui/card";
import { pageOrgContext } from "@/server/page";
import { db } from "@/server/db";
import { getEntitlements, limitOf } from "@/server/billing/entitlements";
import { can } from "@/server/tenancy/context";
import { daysAgo, now } from "@/lib/clock";

export const metadata = { title: "Administration" };

export default async function AdminOverview({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { slug } = await params;
  const { welcome } = await searchParams;
  const ctx = await pageOrgContext(slug, ["org.settings", "members.manage", "audit.view"]);
  const since = daysAgo(30);
  const [members, pending, meetings, attendance, requests, ent, groups] = await Promise.all([
    db.membership.count({ where: { organizationId: ctx.org.id, status: "ACTIVE" } }),
    db.membership.count({ where: { organizationId: ctx.org.id, status: "PENDING" } }),
    db.meetingOccurrence.count({ where: { organizationId: ctx.org.id, startsAt: { gte: since, lte: now() }, status: { not: "CANCELLED" } } }),
    db.meetingAttendance.count({ where: { organizationId: ctx.org.id, createdAt: { gte: since } } }),
    db.prayerRequest.count({ where: { organizationId: ctx.org.id, createdAt: { gte: since } } }),
    getEntitlements(ctx.org.id),
    db.communityGroup.count({ where: { organizationId: ctx.org.id, archivedAt: null } }),
  ]);
  const memberLimit = limitOf(ent, "limit.members");
  const steps = [
    { done: !!ctx.org.logoUrl && !!ctx.org.description, label: "Add a logo and description", href: "settings" },
    { done: members > 1, label: "Invite members", href: "invitations" },
    { done: groups > 0, label: "Create a prayer group", href: "groups" },
    { done: (await db.meeting.count({ where: { organizationId: ctx.org.id } })) > 0, label: "Schedule your first meeting", href: "meetings/new" },
    { done: (await db.prayerPoint.count({ where: { organizationId: ctx.org.id } })) > 0, label: "Publish a prayer point", href: "content" },
  ];
  return (
    <>
      <PageHeader eyebrow={ctx.org.name} title="Administration" />
      {welcome && <Notice tone="success" title="Your community is ready" className="mb-6">Work through the checklist below to get started.</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active members" value={members} hint={memberLimit === null ? "Unlimited on your plan" : `of ${memberLimit} on ${ent.plan.name}`} />
        <Stat label="Join requests" value={pending} />
        <Stat label="Sessions (30 days)" value={meetings} />
        <Stat label="Recorded attendances (30 days)" value={attendance} hint="In-app + host-marked" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Getting started</CardTitle>
          <ul className="mt-3 space-y-2">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3 text-sm">
                <span aria-hidden className={`flex size-5 items-center justify-center rounded-full text-xs ${s.done ? "bg-success text-white" : "border border-line"}`}>{s.done ? "✓" : ""}</span>
                {s.done ? <span className="text-muted line-through">{s.label}</span> : <Link href={`/o/${slug}/admin/${s.href}`} className="text-plum-700 underline">{s.label}</Link>}
                <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>Community activity</CardTitle>
          <p className="mt-2 text-sm text-muted">{requests} prayer requests shared in the last 30 days. Request contents are only visible to people with the right role.</p>
          {pending > 0 && can(ctx, "members.manage") && <Link href={`/o/${slug}/admin/members?status=PENDING`} className="mt-3 inline-block text-sm text-plum-700 underline">Review {pending} join request{pending === 1 ? "" : "s"}</Link>}
        </Card>
      </div>
    </>
  );
}
