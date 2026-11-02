import Link from "next/link";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { requireUser } from "@/server/auth/current-user";
import { listMyOrganizations } from "@/server/orgs/service";
import { ROLE_LABELS } from "@/server/tenancy/permissions";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { resendVerificationAction } from "../(auth)/actions";

export const metadata = { title: "My communities" };

export default async function AppHome() {
  const user = await requireUser("/app");
  const memberships = await listMyOrganizations(user.id);
  return (
    <>
      <PageHeader
        title={`Welcome, ${user.displayName ?? user.name.split(" ")[0]}`}
        description="Your communities and recent activity."
        actions={
          <>
            <LinkButton href="/communities" variant="secondary">
              Find a community
            </LinkButton>
            <LinkButton href="/orgs/new">Start a community</LinkButton>
          </>
        }
      />
      {!user.emailVerifiedAt && (
        <Notice tone="warning" title="Please confirm your email address" className="mb-6">
          <p>We sent a link to {user.email}. Confirming lets us send meeting reminders and receipts.</p>
          <ActionForm action={resendVerificationAction} className="mt-2 space-y-2">
            <SubmitButton variant="secondary" size="sm">Resend link</SubmitButton>
          </ActionForm>
        </Notice>
      )}
      {memberships.length === 0 ? (
        <EmptyState title="You're not part of a community yet" action={<LinkButton href="/orgs/new">Start a community</LinkButton>}>
          Ask your community for an invitation link, browse public communities, or start your own.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {memberships.map((m) => (
            <Link key={m.id} href={m.status === "ACTIVE" ? `/o/${m.organization.slug}` : `/c/${m.organization.slug}`} className="block">
              <Card className="h-full transition-shadow hover:shadow-md">
                <div className="flex items-center gap-3">
                  <Avatar name={m.organization.name} src={m.organization.logoUrl} size={48} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-plum-900">{m.organization.name}</p>
                    {m.organization.tagline && <p className="truncate text-sm text-muted">{m.organization.tagline}</p>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.status === "PENDING" && <Badge tone="warning">Awaiting approval</Badge>}
                  {m.organization.status === "SUSPENDED" && <Badge tone="danger">Suspended</Badge>}
                  {m.roles.filter((r) => r !== "MEMBER").map((r) => (
                    <Badge key={r} tone="violet">{ROLE_LABELS[r]}</Badge>
                  ))}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
