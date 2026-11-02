import Link from "next/link";
import type { MembershipStatus, OrgRole } from "@prisma/client";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { InlineAction } from "@/components/ui/inline-action";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { pageOrgContext } from "@/server/page";
import { listMembers } from "@/server/members/service";
import { can } from "@/server/tenancy/context";
import { LIMITED_ASSIGNABLE_ROLES, ROLE_LABELS } from "@/server/tenancy/permissions";
import { joinRequestAction, memberStatusAction, setRolesAction, transferOwnershipAction } from "../actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Members" };

const EDITABLE: OrgRole[] = ["ADMIN", "MODERATOR", "PRAYER_COORDINATOR", "HOST", "FINANCE_ADMIN"];
const STATUSES: { id: MembershipStatus; label: string }[] = [
  { id: "ACTIVE", label: "Active" },
  { id: "PENDING", label: "Join requests" },
  { id: "SUSPENDED", label: "Suspended" },
];

export default async function MembersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ status?: string; q?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await pageOrgContext(slug, "members.view");
  const status = (STATUSES.find((s) => s.id === sp.status)?.id ?? "ACTIVE") as MembershipStatus;
  const rows = await listMembers(ctx, { status, q: sp.q?.slice(0, 80) });
  const manage = can(ctx, "members.manage");
  const fullAssign = can(ctx, "roles.assign");
  const canAssign = fullAssign || can(ctx, "roles.assign_limited");
  const isOwner = ctx.membership.roles.includes("OWNER");
  return (
    <>
      <PageHeader title="Members" actions={manage ? <Link href={`/o/${slug}/admin/invitations`} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Invite people</Link> : undefined} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Member status" className="flex gap-1 overflow-x-auto">
          {STATUSES.map((s) => (
            <Link key={s.id} href={`?status=${s.id}`} aria-current={status === s.id ? "page" : undefined} className={cn("rounded-full px-4 py-2 text-sm", status === s.id ? "bg-plum-800 text-white" : "bg-surface hover:bg-violet-50")}>{s.label}</Link>
          ))}
        </nav>
        <form className="flex gap-2" role="search">
          <input type="hidden" name="status" value={status} />
          <label htmlFor="q" className="sr-only">Search members</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="Search name or email" className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm" />
          <button className="rounded-lg border border-line bg-surface px-3 text-sm">Search</button>
        </form>
      </div>
      {rows.length === 0 ? <EmptyState title="No members here" /> : (
        <div className="space-y-3">
          {rows.map((m) => {
            const isSelf = m.userId === ctx.actor.id;
            const targetOwner = m.roles.includes("OWNER");
            const elevated = m.roles.some((r) => ["OWNER", "ADMIN", "FINANCE_ADMIN", "PRAYER_COORDINATOR"].includes(r));
            const canManageThis = manage && !isSelf && !targetOwner && (!elevated || isOwner);
            const assignable = (fullAssign ? EDITABLE : LIMITED_ASSIGNABLE_ROLES.filter((r) => r !== "MEMBER")) as OrgRole[];
            return (
              <Card key={m.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.user.name} src={m.user.avatarUrl} />
                    <div>
                      <p className="font-medium">{m.user.name}{isSelf && " (you)"}</p>
                      {manage && <p className="text-xs text-muted">{m.user.email}</p>}
                      <div className="mt-1 flex flex-wrap gap-1">{m.roles.filter((r) => r !== "MEMBER").map((r) => <Badge key={r} tone={r === "OWNER" ? "gold" : "violet"}>{ROLE_LABELS[r]}</Badge>)}</div>
                      {m.joinMessage && status === "PENDING" && <p className="mt-2 text-sm italic text-muted">“{m.joinMessage}”</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {status === "PENDING" && manage && (
                      <>
                        <InlineAction action={joinRequestAction.bind(null, slug)} fields={{ id: m.id, decision: "approve" }} variant="primary">Approve</InlineAction>
                        <InlineAction action={joinRequestAction.bind(null, slug)} fields={{ id: m.id, decision: "reject" }}>Decline</InlineAction>
                      </>
                    )}
                    {status === "ACTIVE" && canManageThis && (
                      <>
                        <InlineAction action={memberStatusAction.bind(null, slug)} fields={{ id: m.id, status: "SUSPENDED" }} confirm={`Suspend ${m.user.name}? They will lose access until reinstated.`}>Suspend</InlineAction>
                        <InlineAction action={memberStatusAction.bind(null, slug)} fields={{ id: m.id, status: "REMOVED" }} variant="danger" confirm={`Remove ${m.user.name} from the community?`}>Remove</InlineAction>
                      </>
                    )}
                    {status === "SUSPENDED" && canManageThis && <InlineAction action={memberStatusAction.bind(null, slug)} fields={{ id: m.id, status: "ACTIVE" }}>Reinstate</InlineAction>}
                    {status === "ACTIVE" && isOwner && !isSelf && !targetOwner && (
                      <InlineAction action={transferOwnershipAction.bind(null, slug)} fields={{ id: m.id }} variant="ghost" confirm={`Make ${m.user.name} the owner? You will become an administrator.`}>Make owner</InlineAction>
                    )}
                  </div>
                </div>
                {status === "ACTIVE" && canAssign && !targetOwner && (!isSelf || fullAssign) && (
                  <details className="mt-3 border-t border-line pt-3">
                    <summary className="cursor-pointer text-sm font-medium text-plum-700">Change roles</summary>
                    <ActionForm action={setRolesAction.bind(null, slug)} className="mt-3 space-y-3">
                      <input type="hidden" name="id" value={m.id} />
                      {/* Preserve roles this administrator is not allowed to change. */}
                      {m.roles.filter((r) => !assignable.includes(r) && r !== "MEMBER").map((r) => <input key={r} type="hidden" name="roles" value={r} />)}
                      <fieldset className="grid gap-2 sm:grid-cols-2">
                        <legend className="sr-only">Roles</legend>
                        {assignable.map((r) => (
                          <label key={r} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" name="roles" value={r} defaultChecked={m.roles.includes(r)} className="size-4 accent-[var(--color-accent)]" />
                            {ROLE_LABELS[r]}
                          </label>
                        ))}
                      </fieldset>
                      <SubmitButton size="sm">Save roles</SubmitButton>
                    </ActionForm>
                  </details>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
