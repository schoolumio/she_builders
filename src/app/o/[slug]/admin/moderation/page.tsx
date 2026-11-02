import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InlineAction } from "@/components/ui/inline-action";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { listReports, listTestimonies } from "@/server/content/service";
import { formatInZone } from "@/lib/time";
import { moderateTestimonyAction, resolveReportAction } from "../actions";

export const metadata = { title: "Moderation" };

export default async function ModerationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug, "content.moderate");
  const user = (await getCurrentUser())!;
  const [testimonies, reports] = await Promise.all([listTestimonies(ctx, { moderation: true }), listReports(ctx)]);
  return (
    <>
      <PageHeader title="Moderation" />
      <h2 className="mb-3 font-semibold text-plum-900">Testimonies awaiting review</h2>
      {testimonies.length === 0 ? <EmptyState title="Nothing to review" /> : (
        <div className="mb-8 space-y-3">
          {testimonies.map((t) => (
            <Card key={t.id}>
              <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{t.title}</p><Badge tone={t.audience === "PUBLIC" ? "gold" : "neutral"}>{t.audience === "PUBLIC" ? "Public (consent given)" : "Members"}</Badge></div>
              <p className="mt-2 whitespace-pre-line text-sm">{t.body}</p>
              <p className="mt-2 text-xs text-muted">{t.showName ? t.author.name : "Name hidden"} · consent {formatInZone(t.consentGivenAt, user.timezone, "d LLL yyyy")}</p>
              <div className="mt-3 flex gap-2">
                <InlineAction action={moderateTestimonyAction.bind(null, slug)} fields={{ id: t.id, decision: "APPROVED" }} variant="primary">Publish</InlineAction>
                <InlineAction action={moderateTestimonyAction.bind(null, slug)} fields={{ id: t.id, decision: "REJECTED" }}>Decline</InlineAction>
              </div>
            </Card>
          ))}
        </div>
      )}
      <h2 className="mb-3 font-semibold text-plum-900">Reports</h2>
      {reports.length === 0 ? <EmptyState title="No reports" /> : (
        <Card className="divide-y divide-line p-0">
          {reports.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm"><Badge>{r.targetType.toLowerCase().replace("_", " ")}</Badge> <span className="ml-1">{r.reason}</span></p>
                <p className="text-xs text-muted">By {r.reporter.name} · {formatInZone(r.createdAt, user.timezone, "d LLL")} · item {r.targetId}</p>
              </div>
              {r.status === "OPEN" ? (
                <div className="flex gap-2">
                  <InlineAction action={resolveReportAction.bind(null, slug)} fields={{ id: r.id, status: "RESOLVED" }}>Resolved</InlineAction>
                  <InlineAction action={resolveReportAction.bind(null, slug)} fields={{ id: r.id, status: "DISMISSED" }} variant="ghost">Dismiss</InlineAction>
                </div>
              ) : <Badge tone="success">{r.status.toLowerCase()}</Badge>}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
