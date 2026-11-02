import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { listAnnouncementsForMember } from "@/server/content/service";
import { formatInZone } from "@/lib/time";

export const metadata = { title: "Announcements" };

export default async function AnnouncementsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug);
  const user = (await getCurrentUser())!;
  const rows = await listAnnouncementsForMember(ctx, 50);
  return (
    <>
      <PageHeader title="Announcements" />
      {rows.length === 0 ? <EmptyState title="No announcements yet" /> : (
        <div className="space-y-3">
          {rows.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-plum-900">{a.title}</h2>
                {a.pinned && <Badge tone="gold">Pinned</Badge>}
                {a.group && <Badge tone="violet">{a.group.name}</Badge>}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm">{a.body}</p>
              {a.publishedAt && <p className="mt-2 text-xs text-muted">{formatInZone(a.publishedAt, user.timezone)}</p>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
