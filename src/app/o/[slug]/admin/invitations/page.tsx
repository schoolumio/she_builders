import { Card, CardTitle, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton, TextAreaField } from "@/components/ui/form";
import { InlineAction } from "@/components/ui/inline-action";
import { pageOrgContext } from "@/server/page";
import { db } from "@/server/db";
import { can } from "@/server/tenancy/context";
import { LIMITED_ASSIGNABLE_ROLES, ROLE_LABELS } from "@/server/tenancy/permissions";
import { getCurrentUser } from "@/server/auth/current-user";
import { formatInZone } from "@/lib/time";
import { inviteAction, revokeInvitationAction } from "../actions";

export const metadata = { title: "Invitations" };

export default async function InvitationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug, "members.manage");
  const user = (await getCurrentUser())!;
  const [invites, groups] = await Promise.all([
    db.invitation.findMany({ where: { organizationId: ctx.org.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.communityGroup.findMany({ where: { organizationId: ctx.org.id, archivedAt: null }, orderBy: { name: "asc" } }),
  ]);
  const roles = can(ctx, "roles.assign") ? (["ADMIN", "MODERATOR", "PRAYER_COORDINATOR", "HOST", "FINANCE_ADMIN"] as const) : LIMITED_ASSIGNABLE_ROLES.filter((r) => r !== "MEMBER");
  const now = new Date();
  return (
    <>
      <PageHeader title="Invitations" description="Invitations are emailed, single-use and expire after 14 days." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="h-fit">
          <CardTitle>Invite people</CardTitle>
          <ActionForm action={inviteAction.bind(null, slug)} className="mt-3" resetOnSuccess>
            <TextAreaField label="Email addresses" name="emails" rows={4} required hint="Separate with commas, spaces or new lines (up to 50)." />
            <fieldset>
              <legend className="text-sm font-medium">Roles (optional)</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {roles.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm"><input type="checkbox" name="roles" value={r} className="size-4" /> {ROLE_LABELS[r]}</label>
                ))}
              </div>
            </fieldset>
            {groups.length > 0 && (
              <fieldset>
                <legend className="text-sm font-medium">Add to groups (optional)</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {groups.map((g) => <label key={g.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="groupIds" value={g.id} className="size-4" /> {g.name}</label>)}
                </div>
              </fieldset>
            )}
            <TextAreaField label="Personal message (optional)" name="message" rows={2} />
            <SubmitButton pendingText="Sending…">Send invitations</SubmitButton>
          </ActionForm>
        </Card>
        <Card className="p-0">
          <div className="p-5 pb-2"><CardTitle>Sent invitations</CardTitle></div>
          {invites.length === 0 ? <div className="p-5"><EmptyState title="No invitations yet" /></div> : (
            <ul className="divide-y divide-line">
              {invites.map((i) => {
                const state = i.acceptedAt ? "Accepted" : i.revokedAt ? "Revoked" : i.expiresAt < now ? "Expired" : "Pending";
                return (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium">{i.email}</p>
                      <p className="text-xs text-muted">{formatInZone(i.createdAt, user.timezone, "d LLL yyyy")} · {i.roles.filter((r) => r !== "MEMBER").map((r) => ROLE_LABELS[r]).join(", ") || "Member"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={state === "Accepted" ? "success" : state === "Pending" ? "warning" : "neutral"}>{state}</Badge>
                      {state === "Pending" && <InlineAction action={revokeInvitationAction.bind(null, slug)} fields={{ id: i.id }} variant="ghost">Revoke</InlineAction>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
