import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { listPrayerRequests } from "@/server/prayer/service";
import { prayerAuthorLabel } from "@/server/prayer/access";
import { getEntitlements } from "@/server/billing/entitlements";
import { formatInZone } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Prayer requests" };

const VIS_LABEL = { PRIVATE: "Private", GROUP: "Group", ORGANIZATION: "Community" } as const;

export default async function PrayerListPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const { tab = "community" } = await searchParams;
  const ctx = await pageOrgContext(slug);
  if (!(await getEntitlements(ctx.org.id)).features.has("feature.prayer_requests")) notFound();
  const user = (await getCurrentUser())!;
  const scope = tab === "mine" ? "mine" : tab === "assigned" ? "assigned" : "community";
  const rows = await listPrayerRequests(ctx, { scope });
  const tabs = [
    { id: "community", label: "Community" },
    { id: "mine", label: "My requests" },
    { id: "assigned", label: "Entrusted to me" },
  ];
  return (
    <>
      <PageHeader title="Prayer requests" description="Carry one another's burdens. Every request shows who can see it." actions={<LinkButton href={`/o/${slug}/prayer/new`}>New prayer request</LinkButton>} />
      <nav aria-label="Prayer request lists" className="mb-4 flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <Link key={t.id} href={`?tab=${t.id}`} aria-current={tab === t.id ? "page" : undefined} className={cn("rounded-full px-4 py-2 text-sm", tab === t.id ? "bg-plum-800 text-white" : "bg-surface text-ink hover:bg-violet-50")}>
            {t.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title={tab === "mine" ? "You haven't shared a request yet" : "No prayer requests here yet"} action={<LinkButton href={`/o/${slug}/prayer/new`} variant="secondary">Share a request</LinkButton>} />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Link key={r.id} href={`/o/${slug}/prayer/${r.id}`} className="block">
              <Card className="transition-shadow hover:shadow-md">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-plum-900">{r.title}</p>
                  <Badge tone={r.visibility === "PRIVATE" ? "violet" : "neutral"}>{VIS_LABEL[r.visibility]}{r.group ? `: ${r.group.name}` : ""}</Badge>
                  {r.moderationStatus === "PENDING" && <Badge tone="warning">Awaiting review</Badge>}
                  {r.moderationStatus === "REJECTED" || r.moderationStatus === "HIDDEN" ? <Badge tone="danger">Not shared</Badge> : null}
                  {r.status === "ANSWERED" && <Badge tone="success">Answered</Badge>}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted">{r.body}</p>
                <p className="mt-2 text-xs text-muted">
                  {prayerAuthorLabel(r, r.author.name, user.id)} · {formatInZone(r.createdAt, user.timezone, "d LLL yyyy")} · {r._count.acknowledgements} praying
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
