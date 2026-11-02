import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InlineAction } from "@/components/ui/inline-action";
import { requirePlatformAdmin } from "@/server/auth/current-user";
import { listSupportRequests } from "@/server/platform/service";
import { supportStatusAction } from "../actions";

export default async function SupportRequests() {
  const admin = await requirePlatformAdmin();
  const rows = await listSupportRequests(admin);
  return (
    <>
      <PageHeader title="Support requests" />
      {rows.length === 0 ? <EmptyState title="No support requests" /> : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{r.subject}</p>
                <Badge tone={r.status === "OPEN" ? "warning" : r.status === "RESOLVED" ? "success" : "neutral"}>{r.status.toLowerCase()}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted">{r.email}{r.organization ? ` · ${r.organization.name}` : ""} · {r.createdAt.toISOString().slice(0, 16)}</p>
              <p className="mt-2 whitespace-pre-line text-sm">{r.body}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["IN_PROGRESS", "RESOLVED", "CLOSED"] as const).filter((s) => s !== r.status).map((s) => (
                  <InlineAction key={s} action={supportStatusAction} fields={{ id: r.id, status: s }} variant="ghost">Mark {s.toLowerCase().replace("_", " ")}</InlineAction>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
