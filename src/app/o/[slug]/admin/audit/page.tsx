import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { pageOrgContext } from "@/server/page";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/current-user";
import { formatInZone } from "@/lib/time";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug, "audit.view");
  const user = (await getCurrentUser())!;
  const rows = await db.auditLog.findMany({ where: { organizationId: ctx.org.id }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 300 });
  return (
    <>
      <PageHeader title="Audit log" description="Sensitive administrative actions in this community. Entries never contain prayer request contents or financial credentials." />
      {rows.length === 0 ? <EmptyState title="No entries yet" /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-canvas text-left text-muted"><tr><th className="px-4 py-2 font-medium">When</th><th className="px-4 py-2 font-medium">Who</th><th className="px-4 py-2 font-medium">Action</th><th className="px-4 py-2 font-medium">Details</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="whitespace-nowrap px-4 py-2">{formatInZone(r.createdAt, user.timezone, "d LLL yyyy HH:mm")}</td>
                  <td className="px-4 py-2">{r.actor?.name ?? "System"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{r.metadata ? JSON.stringify(r.metadata).slice(0, 160) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
