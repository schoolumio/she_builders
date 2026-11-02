import Link from "next/link";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { listPublicOrganizations } from "@/server/orgs/service";

export const metadata = { title: "Communities" };
export const dynamic = "force-dynamic";

export default async function CommunitiesPage() {
  const orgs = await listPublicOrganizations(60);
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h1 className="font-serif text-3xl font-semibold text-plum-900">Communities</h1>
      <p className="mt-2 text-muted">Communities that have chosen to be listed publicly.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orgs.length === 0 && <EmptyState title="No public communities yet">Be the first to start one.</EmptyState>}
        {orgs.map((o) => (
          <Link key={o.slug} href={`/c/${o.slug}`} className="block">
            <Card className="h-full transition-shadow hover:shadow-md">
              <div className="flex items-center gap-3">
                <Avatar name={o.name} src={o.logoUrl} size={44} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-plum-900">{o.name}</p>
                  <p className="text-xs text-muted">{o.country}</p>
                </div>
              </div>
              {o.tagline && <p className="mt-3 line-clamp-2 text-sm text-muted">{o.tagline}</p>}
              {o.verification === "VERIFIED" && <Badge tone="success" className="mt-3">Organisation verified by BridgeCodes</Badge>}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
