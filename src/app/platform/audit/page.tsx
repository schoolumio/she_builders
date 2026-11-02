import { Card, PageHeader } from "@/components/ui/card";
import { requirePlatformAdmin } from "@/server/auth/current-user";
import { platformAuditLog } from "@/server/platform/service";

export default async function PlatformAudit() {
  const admin = await requirePlatformAdmin();
  const rows = await platformAuditLog(admin, { take: 300 });
  return (
    <>
      <PageHeader title="Audit log" description="All audited actions across the platform (metadata only; never confidential content)." />
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-canvas text-left text-muted"><tr><th className="px-4 py-2 font-medium">When (UTC)</th><th className="px-4 py-2 font-medium">Organisation</th><th className="px-4 py-2 font-medium">Actor</th><th className="px-4 py-2 font-medium">Action</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="whitespace-nowrap px-4 py-2">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td className="px-4 py-2">{r.organization?.name ?? "—"}</td>
                <td className="px-4 py-2">{r.actor?.name ?? "system"}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
