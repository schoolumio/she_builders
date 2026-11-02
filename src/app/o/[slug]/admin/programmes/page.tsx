import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pageOrgContext } from "@/server/page";
import { listProgrammes, PROGRAMME_TYPE_LABELS } from "@/server/programmes/service";

export const metadata = { title: "Manage programmes" };

export default async function AdminProgrammesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug, "programmes.manage");
  const rows = await listProgrammes(ctx, { manage: true });
  return (
    <>
      <PageHeader title="Programmes" actions={<LinkButton href={`/o/${slug}/admin/programmes/new`}>New programme</LinkButton>} />
      {rows.length === 0 ? <EmptyState title="No programmes yet" /> : (
        <div className="space-y-3">
          {rows.map((p) => (
            <Link key={p.id} href={`/o/${slug}/admin/programmes/${p.id}`} className="block">
              <Card className="flex items-center justify-between gap-3 hover:shadow-md">
                <div>
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-sm text-muted">{PROGRAMME_TYPE_LABELS[p.type]} · {p._count.activities}/{p.durationDays} days written · {p._count.enrollments} enrolled</p>
                </div>
                <Badge tone={p.status === "PUBLISHED" ? "success" : p.status === "DRAFT" ? "warning" : "neutral"}>{p.status.toLowerCase()}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
