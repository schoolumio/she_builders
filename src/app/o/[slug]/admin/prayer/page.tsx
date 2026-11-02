import Link from "next/link";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InlineAction } from "@/components/ui/inline-action";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { listPrayerRequests } from "@/server/prayer/service";
import { prayerAuthorLabel } from "@/server/prayer/access";
import { can } from "@/server/tenancy/context";
import { formatInZone } from "@/lib/time";
import { moderatePrayerAction } from "../actions";

export const metadata = { title: "Prayer care" };

export default async function PrayerCarePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug, ["prayer.moderate", "prayer.view_confidential"]);
  const user = (await getCurrentUser())!;
  const isCoordinator = can(ctx, "prayer.view_confidential");
  const [pending, all] = await Promise.all([listPrayerRequests(ctx, { scope: "moderation" }), listPrayerRequests(ctx, { take: 100 })]);
  const privateOnes = all.filter((r) => r.visibility === "PRIVATE" && r.authorId !== user.id);
  return (
    <>
      <PageHeader title="Prayer care" description={isCoordinator ? "Private requests, moderation and prayer-team assignments." : "Review shared requests before they appear to members."} />
      <Notice className="mb-6">
        Treat every request with confidentiality. {isCoordinator ? "Private requests are visible only to prayer coordinators and the people you assign." : "You can moderate group and community requests. Private requests are visible only to prayer coordinators."}
      </Notice>
      <h2 className="mb-3 font-semibold text-plum-900">Awaiting review ({pending.length})</h2>
      {pending.length === 0 ? <EmptyState title="Nothing to review" /> : (
        <div className="mb-8 space-y-3">
          {pending.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{r.title}</p><Badge>{r.visibility.toLowerCase()}{r.group ? `: ${r.group.name}` : ""}</Badge></div>
              <p className="mt-2 whitespace-pre-line text-sm">{r.body}</p>
              <p className="mt-2 text-xs text-muted">{prayerAuthorLabel(r, r.author.name, user.id)} · {formatInZone(r.createdAt, user.timezone)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <InlineAction action={moderatePrayerAction.bind(null, slug)} fields={{ id: r.id, decision: "APPROVED" }} variant="primary">Approve</InlineAction>
                <InlineAction action={moderatePrayerAction.bind(null, slug)} fields={{ id: r.id, decision: "REJECTED" }}>Don&apos;t share</InlineAction>
              </div>
            </Card>
          ))}
        </div>
      )}
      {isCoordinator && (
        <>
          <h2 className="mb-3 font-semibold text-plum-900">Private requests</h2>
          {privateOnes.length === 0 ? <EmptyState title="No private requests" /> : (
            <Card className="divide-y divide-line p-0">
              {privateOnes.map((r) => (
                <Link key={r.id} href={`/o/${slug}/admin/prayer/${r.id}`} className="block px-5 py-3 hover:bg-violet-50">
                  <p className="font-medium">{r.title} {r.status === "ANSWERED" && <Badge tone="success">answered</Badge>}</p>
                  <p className="text-xs text-muted">{prayerAuthorLabel(r, r.author.name, user.id)} · {formatInZone(r.createdAt, user.timezone, "d LLL")} · {r._count.acknowledgements} praying</p>
                </Link>
              ))}
            </Card>
          )}
        </>
      )}
    </>
  );
}
