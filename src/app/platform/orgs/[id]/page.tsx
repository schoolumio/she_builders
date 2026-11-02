import { notFound } from "next/navigation";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { requirePlatformAdmin } from "@/server/auth/current-user";
import { getOrganizationForPlatform, platformAuditLog } from "@/server/platform/service";
import { listPlans } from "@/server/billing/service";
import { CONNECTION_STATUS_COPY } from "@/server/payments/status";
import { assignPlanAction, orgStatusAction, orgVerificationAction, reviewConnectionAction } from "../../actions";

export default async function PlatformOrgDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  const { id } = await params;
  const data = await getOrganizationForPlatform(admin, id).catch(() => notFound());
  const { org, owners } = data;
  const [plans, audit] = await Promise.all([listPlans({ includeHidden: true }), platformAuditLog(admin, { organizationId: org.id, take: 25 })]);
  const superAdmin = admin.platformRole === "SUPER_ADMIN";
  return (
    <>
      <PageHeader title={org.name} eyebrow={`/${org.slug}`} actions={<Badge tone={org.status === "ACTIVE" ? "success" : "danger"}>{org.status.toLowerCase()}</Badge>} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardTitle>Account</CardTitle>
          <dl className="mt-3 space-y-1 text-sm">
            <div><dt className="inline text-muted">Owners: </dt><dd className="inline">{owners.map((o) => `${o.name} <${o.email}>`).join(", ")}</dd></div>
            <div><dt className="inline text-muted">Country / time zone: </dt><dd className="inline">{org.country} · {org.timezone}</dd></div>
            <div><dt className="inline text-muted">Contact: </dt><dd className="inline">{org.contactEmail ?? "—"}</dd></div>
            <div><dt className="inline text-muted">Members / meetings / campaigns: </dt><dd className="inline">{org._count.memberships} / {org._count.meetings} / {org._count.campaigns}</dd></div>
            <div><dt className="inline text-muted">Created: </dt><dd className="inline">{org.createdAt.toISOString().slice(0, 10)}</dd></div>
            {org.suspendedReason && <div><dt className="inline text-muted">Suspension reason: </dt><dd className="inline">{org.suspendedReason}</dd></div>}
          </dl>
          {superAdmin && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <ActionForm action={orgStatusAction}>
                <input type="hidden" name="id" value={org.id} />
                <SelectField label="Status" name="status" defaultValue={org.status} options={[{ value: "ACTIVE", label: "Active" }, { value: "SUSPENDED", label: "Suspended" }, { value: "CLOSED", label: "Closed" }]} />
                <TextField label="Reason (required to suspend/close)" name="reason" />
                <SubmitButton size="sm" variant="secondary">Update status</SubmitButton>
              </ActionForm>
              <ActionForm action={orgVerificationAction}>
                <input type="hidden" name="id" value={org.id} />
                <SelectField label="Organisation verification" name="verification" defaultValue={org.verification} options={["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"].map((v) => ({ value: v, label: v.toLowerCase() }))} />
                <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
              </ActionForm>
            </div>
          )}
        </Card>
        <Card>
          <CardTitle>Subscription</CardTitle>
          <p className="mt-2 text-sm">{org.subscription ? `${org.subscription.plan.name} · ${org.subscription.status.toLowerCase()} · ${org.subscription.billingProvider ?? ""}` : "None"}</p>
          {superAdmin && (
            <ActionForm action={assignPlanAction} className="mt-3">
              <input type="hidden" name="id" value={org.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField label="Plan" name="plan" defaultValue={org.subscription?.plan.code} options={plans.map((p) => ({ value: p.code, label: p.name }))} />
                <SelectField label="Status" name="status" defaultValue="ACTIVE" options={["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "EXPIRED"].map((s) => ({ value: s, label: s.toLowerCase() }))} />
                <TextField label="Period end (optional)" name="periodEnd" type="date" />
                <TextField label="Note (audited)" name="note" />
              </div>
              <SubmitButton size="sm" variant="secondary">Assign plan manually</SubmitButton>
            </ActionForm>
          )}
        </Card>
        <Card className="xl:col-span-2">
          <CardTitle>Payment connections</CardTitle>
          {org.paymentConnections.length === 0 ? <p className="mt-2 text-sm text-muted">None.</p> : (
            <ul className="mt-3 space-y-4">
              {org.paymentConnections.map((c) => (
                <li key={c.id} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><strong>{c.provider}</strong><Badge>{CONNECTION_STATUS_COPY[c.status].label}</Badge>{c.platformReviewedAt && <Badge tone="success">platform reviewed</Badge>}</div>
                  <p className="mt-1 text-muted">{c.accountName ?? "—"} · {c.bankName ?? ""} {c.accountLast4 ? `····${c.accountLast4}` : ""} · charges {c.chargesEnabled ? "enabled" : "disabled"}</p>
                  {c.requirements.length > 0 && <p className="text-xs text-muted">Requirements: {c.requirements.join(", ")}</p>}
                  {superAdmin && c.provider === "PAYSTACK" && c.status !== "DISCONNECTED" && (
                    <ActionForm action={reviewConnectionAction} className="mt-2 flex flex-col gap-2 space-y-0 sm:flex-row sm:items-end">
                      <input type="hidden" name="id" value={c.id} />
                      <TextField label="Review note" name="note" className="flex-1" />
                      <button name="decision" value="approve" className="rounded-lg bg-success px-3 py-2 text-sm font-semibold text-white">Approve organisation</button>
                      <button name="decision" value="reject" className="rounded-lg bg-danger px-3 py-2 text-sm font-semibold text-white">Reject</button>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="xl:col-span-2">
          <CardTitle>Recent audit events</CardTitle>
          <ul className="mt-2 divide-y divide-line text-sm">{audit.map((a) => <li key={a.id} className="flex justify-between gap-3 py-1.5"><span className="font-mono text-xs">{a.action}</span><span className="text-xs text-muted">{a.actor?.name ?? "system"} · {a.createdAt.toISOString().slice(0, 16)}</span></li>)}</ul>
        </Card>
      </div>
    </>
  );
}
