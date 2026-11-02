import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { pageOrgContext } from "@/server/page";
import { listProgrammes, PROGRAMME_TYPE_LABELS } from "@/server/programmes/service";
import { getEntitlements } from "@/server/billing/entitlements";

export const metadata = { title: "Programmes" };

export default async function ProgrammesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug);
  if (!(await getEntitlements(ctx.org.id)).features.has("feature.programmes")) notFound();
  const rows = await listProgrammes(ctx);
  return (
    <>
      <PageHeader title="Programmes" description="Bible studies, prayer challenges and devotionals." />
      {rows.length === 0 ? <EmptyState title="No programmes yet" /> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((p) => (
            <Link key={p.id} href={`/o/${slug}/programmes/${p.id}`} className="block">
              <Card className="h-full transition-shadow hover:shadow-md">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="violet">{PROGRAMME_TYPE_LABELS[p.type]}</Badge>
                  {p.enrollments.length > 0 && <Badge tone="success">Joined</Badge>}
                </div>
                <p className="mt-2 font-semibold text-plum-900">{p.title}</p>
                <p className="mt-1 text-xs text-muted">Starts {p.startDate} · {p.durationDays} days · {p._count.enrollments} taking part</p>
                {p.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{p.description}</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
