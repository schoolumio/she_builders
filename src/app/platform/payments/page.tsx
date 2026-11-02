import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requirePlatformAdmin } from "@/server/auth/current-user";
import { pendingConnectionReviews } from "@/server/platform/service";
import { CONNECTION_STATUS_COPY } from "@/server/payments/status";

export default async function PaymentReviews() {
  const admin = await requirePlatformAdmin();
  const rows = await pendingConnectionReviews(admin);
  return (
    <>
      <PageHeader title="Payment account reviews" description="Connections awaiting verification or restricted by the provider. Paystack connections additionally need BridgeCodes organisation review." />
      {rows.length === 0 ? <EmptyState title="Nothing awaiting review" /> : (
        <Card className="divide-y divide-line p-0">
          {rows.map((c) => (
            <Link key={c.id} href={`/platform/orgs/${c.organization.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-violet-50">
              <span><strong>{c.organization.name}</strong> <span className="text-sm text-muted">({c.organization.country})</span></span>
              <span className="flex gap-2"><Badge>{c.provider}</Badge><Badge tone="warning">{CONNECTION_STATUS_COPY[c.status].label}</Badge>{c.platformReviewedAt && <Badge tone="success">reviewed</Badge>}</span>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
