import Link from "next/link";
import { Card, CardTitle, EmptyState, Notice, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { OccurrenceList } from "@/components/occurrence-list";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { listUpcomingOccurrences } from "@/server/meetings/service";
import { listAnnouncementsForMember, listPrayerPoints } from "@/server/content/service";
import { can } from "@/server/tenancy/context";

export default async function OrgHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug);
  const user = (await getCurrentUser())!;
  const [occurrences, points, announcements] = await Promise.all([
    listUpcomingOccurrences(ctx, { days: 7, take: 6 }),
    listPrayerPoints(ctx, { take: 1 }),
    listAnnouncementsForMember(ctx, 3),
  ]);
  const today = points[0];
  return (
    <>
      <PageHeader eyebrow={ctx.org.name} title="Today in your community" actions={can(ctx, "meetings.create") ? <LinkButton href={`/o/${slug}/admin/meetings/new`}>Schedule a meeting</LinkButton> : undefined} />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between">
              <CardTitle>Upcoming meetings</CardTitle>
              <Link href={`/o/${slug}/meetings`} className="text-sm text-plum-700 underline">All meetings</Link>
            </div>
            {occurrences.length === 0 ? <p className="mt-3 text-sm text-muted">No meetings in the next 7 days.</p> : <div className="mt-2"><OccurrenceList rows={occurrences} slug={slug} tz={user.timezone} /></div>}
          </Card>
          <Card>
            <div className="flex items-center justify-between">
              <CardTitle>Announcements</CardTitle>
              <Link href={`/o/${slug}/announcements`} className="text-sm text-plum-700 underline">All</Link>
            </div>
            {announcements.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No announcements yet.</p>
            ) : (
              <ul className="mt-3 space-y-4">
                {announcements.map((a) => (
                  <li key={a.id}>
                    <p className="font-medium text-plum-900">{a.pinned && "📌 "}{a.title}</p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted">{a.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="border-gold-100 bg-gradient-to-br from-gold-100/60 to-surface">
            <CardTitle>Prayer point</CardTitle>
            {today ? (
              <div className="mt-2">
                <p className="font-serif text-lg font-semibold text-plum-900">{today.title}</p>
                <p className="mt-2 whitespace-pre-line text-sm">{today.body}</p>
                {today.scriptureRefs.length > 0 && <p className="mt-3 text-sm font-medium text-gold-600">{today.scriptureRefs.join(" · ")}</p>}
                <Link href={`/o/${slug}/prayer-points`} className="mt-3 inline-block text-sm text-plum-700 underline">Previous prayer points</Link>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">No prayer point has been published yet.</p>
            )}
          </Card>
          <Card>
            <CardTitle>Quick actions</CardTitle>
            <div className="mt-3 flex flex-col gap-2">
              <LinkButton href={`/o/${slug}/prayer/new`} variant="secondary">Share a prayer request</LinkButton>
              <LinkButton href={`/o/${slug}/testimonies`} variant="secondary">Share a testimony</LinkButton>
              {ctx.org.fundraisingEnabled && <LinkButton href={`/o/${slug}/give`} variant="secondary">Give</LinkButton>}
            </div>
          </Card>
          {ctx.membership.roles.length === 1 && occurrences.length === 0 && !today && (
            <EmptyState title="It's quiet here">Your community&apos;s leaders haven&apos;t scheduled anything yet. Check back soon.</EmptyState>
          )}
          {can(ctx, "org.settings") && !ctx.org.logoUrl && (
            <Notice title="Finish setting up">Add a logo and description in <Link className="underline" href={`/o/${slug}/admin/settings`}>Settings</Link>.</Notice>
          )}
        </div>
      </div>
    </>
  );
}
