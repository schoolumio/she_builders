import { Card, CardTitle, PageHeader, Stat } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requirePlatformAdmin } from "@/server/auth/current-user";
import { integrationHealth, platformStats } from "@/server/platform/service";

export default async function PlatformHome() {
  const admin = await requirePlatformAdmin();
  const [stats, health] = await Promise.all([platformStats(admin), integrationHealth()]);
  const ok = (b: boolean) => <Badge tone={b ? "success" : "warning"}>{b ? "configured" : "not configured"}</Badge>;
  return (
    <>
      <PageHeader title="Platform overview" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Organisations" value={stats.orgs} />
        <Stat label="Active organisations" value={stats.active} />
        <Stat label="Active users" value={stats.users} />
        <Stat label="Paid / trial subscriptions" value={stats.paid} />
      </div>
      <Card className="mt-6">
        <CardTitle>Integration health</CardTitle>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex justify-between">Real-time meetings ({health.realtime.provider}) {ok(health.realtime.configured)}</li>
          {health.payments.map((p) => (
            <li key={p.id} className="flex justify-between">{p.name} <span className="flex gap-1">{ok(p.available)}{p.testMode && <Badge tone="gold">test mode</Badge>}</span></li>
          ))}
          <li className="flex justify-between">Subscription billing <Badge tone={health.billing === "none" ? "warning" : "success"}>{health.billing}</Badge></li>
          <li className="flex justify-between">Email delivery {ok(health.email.configured)}</li>
          <li className="flex justify-between">Failed emails (gave up) <span>{health.email.failed}</span></li>
          <li className="flex justify-between">Emails awaiting retry <span>{health.email.retrying}</span></li>
          <li className="flex justify-between">Unprocessed payment events (&gt;10 min) <Badge tone={health.webhooks.stuckPaymentEvents ? "danger" : "success"}>{health.webhooks.stuckPaymentEvents}</Badge></li>
          <li className="flex justify-between">Last payment webhook <span>{health.webhooks.lastPaymentEvent ? `${health.webhooks.lastPaymentEvent.provider} · ${health.webhooks.lastPaymentEvent.receivedAt.toISOString().slice(0, 16)}` : "none"}</span></li>
        </ul>
      </Card>
    </>
  );
}
