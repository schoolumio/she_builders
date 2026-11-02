import { Card, CardTitle, Notice, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { CodesForm, MfaSetup } from "@/components/mfa-setup";
import { requireUser } from "@/server/auth/current-user";
import { mfaStatus } from "@/server/auth/mfa";
import { db } from "@/server/db";
import { formatInZone } from "@/lib/time";
import { beginMfaAction, confirmMfaAction, disableMfaAction, regenerateCodesAction } from "./actions";

export const metadata = { title: "Account security" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const user = await requireUser("/app/security");
  const { required } = await searchParams;
  const [status, sessions, gated] = await Promise.all([
    mfaStatus(user.id),
    db.session.findMany({ where: { userId: user.id }, orderBy: { lastSeenAt: "desc" }, take: 10 }),
    db.membership.findMany({ where: { userId: user.id, status: "ACTIVE", organization: { requireMfaForAdmins: true }, roles: { hasSome: ["OWNER", "ADMIN", "FINANCE_ADMIN", "PRAYER_COORDINATOR"] } }, include: { organization: { select: { name: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Account security" />
      {required === "platform" && !status.enabled && <Notice tone="warning" className="mb-4" title="Two-factor authentication is required">Platform administration requires two-factor authentication. Set it up below.</Notice>}
      {gated.length > 0 && !status.enabled && (
        <Notice tone="warning" className="mb-4" title="Some of your roles are paused">{gated.map((g) => g.organization.name).join(", ")} require two-factor authentication for administrators. Your administrative access returns as soon as you turn it on.</Notice>
      )}
      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Two-factor authentication</CardTitle>
            <Badge tone={status.enabled ? "success" : "warning"}>{status.enabled ? "On" : "Off"}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">A code from your phone is needed in addition to your password. Strongly recommended for owners, finance administrators and prayer coordinators.</p>
          <div className="mt-4">
            {!status.enabled ? (
              <MfaSetup begin={beginMfaAction} confirm={confirmMfaAction} />
            ) : (
              <div className="space-y-6">
                <p className="text-sm">On since {formatInZone(status.enabledAt!, user.timezone, "d LLL yyyy")}. {status.recoveryCodesLeft} recovery code{status.recoveryCodesLeft === 1 ? "" : "s"} left.</p>
                <CodesForm action={regenerateCodesAction} />
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-danger">Turn off two-factor authentication</summary>
                  <ActionForm action={disableMfaAction} className="mt-3 max-w-sm">
                    <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
                    <TextField label="Current code or recovery code" name="code" autoComplete="one-time-code" required />
                    <SubmitButton variant="danger">Turn off</SubmitButton>
                  </ActionForm>
                </details>
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardTitle>Signed-in devices</CardTitle>
          <ul className="mt-3 divide-y divide-line text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="py-2">
                <p className="truncate">{s.userAgent ?? "Unknown device"}</p>
                <p className="text-xs text-muted">Last active {formatInZone(s.lastSeenAt, user.timezone)}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">To sign out everywhere, change your password.</p>
        </Card>
      </div>
    </>
  );
}
