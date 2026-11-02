import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { pageOrgContext } from "@/server/page";
import { listPrayerPoints } from "@/server/content/service";

export const metadata = { title: "Prayer points" };

export default async function PrayerPointsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug);
  const rows = await listPrayerPoints(ctx, { take: 60 });
  return (
    <>
      <PageHeader title="Prayer points" description="Daily prayer focus and scripture from your community's leaders." />
      {rows.length === 0 ? <EmptyState title="No prayer points yet" /> : (
        <div className="space-y-3">
          {rows.map((p) => (
            <Card key={p.id}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gold-600">{p.forDate}</p>
              <h2 className="mt-1 font-serif text-lg font-semibold text-plum-900">{p.title}</h2>
              <p className="mt-2 whitespace-pre-line text-sm">{p.body}</p>
              {p.scriptureRefs.length > 0 && <p className="mt-2 text-sm text-gold-600">{p.scriptureRefs.join(" · ")}</p>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
