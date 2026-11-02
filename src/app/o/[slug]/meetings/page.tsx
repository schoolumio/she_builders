import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { OccurrenceList } from "@/components/occurrence-list";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { listUpcomingOccurrences } from "@/server/meetings/service";

export const metadata = { title: "Meetings" };

export default async function MeetingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug);
  const user = (await getCurrentUser())!;
  const rows = await listUpcomingOccurrences(ctx, { days: 30, take: 100, includeCancelled: true });
  return (
    <>
      <PageHeader
        title="Meetings"
        description={<>Times are shown in your time zone ({user.timezone}). <a className="underline" href={`/api/orgs/${slug}/calendar.ics`}>Download calendar (.ics)</a></>}
      />
      {rows.length === 0 ? <EmptyState title="No upcoming meetings">When meetings are scheduled they&apos;ll appear here.</EmptyState> : <Card className="p-2 sm:p-3"><OccurrenceList rows={rows} slug={slug} tz={user.timezone} /></Card>}
    </>
  );
}
