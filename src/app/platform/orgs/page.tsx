import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requirePlatformAdmin } from "@/server/auth/current-user";
import { listOrganizationsForPlatform } from "@/server/platform/service";

export default async function PlatformOrgs({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const admin = await requirePlatformAdmin();
  const { q } = await searchParams;
  const orgs = await listOrganizationsForPlatform(admin, q?.slice(0, 80));
  return (
    <>
      <PageHeader title="Organisations" />
      <form role="search" className="mb-4 flex gap-2">
        <label htmlFor="q" className="sr-only">Search</label>
        <input id="q" name="q" defaultValue={q} placeholder="Name or slug" className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm" />
        <button className="rounded-lg border border-line bg-surface px-3 text-sm">Search</button>
      </form>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-canvas text-left text-muted"><tr><th className="px-4 py-2 font-medium">Organisation</th><th className="px-4 py-2 font-medium">Country</th><th className="px-4 py-2 font-medium">Members</th><th className="px-4 py-2 font-medium">Plan</th><th className="px-4 py-2 font-medium">Status</th></tr></thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} className="border-t border-line">
                <td className="px-4 py-2"><Link href={`/platform/orgs/${o.id}`} className="font-medium underline">{o.name}</Link><span className="block text-xs text-muted">/{o.slug}</span></td>
                <td className="px-4 py-2">{o.country}</td>
                <td className="px-4 py-2">{o._count.memberships}</td>
                <td className="px-4 py-2">{o.subscription?.plan.name ?? "—"} <span className="text-xs text-muted">{o.subscription?.status.toLowerCase()}</span></td>
                <td className="px-4 py-2"><Badge tone={o.status === "ACTIVE" ? "success" : "danger"}>{o.status.toLowerCase()}</Badge> {o.verification === "VERIFIED" && <Badge tone="violet">verified</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
