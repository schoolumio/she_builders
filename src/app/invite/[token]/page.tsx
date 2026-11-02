import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Card, Notice } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { getCurrentUser } from "@/server/auth/current-user";
import { findInvitationByToken } from "@/server/members/service";
import { ROLE_LABELS } from "@/server/tenancy/permissions";
import { acceptInvitationAction } from "../../app/actions";

export const metadata = { title: "Invitation", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [found, user] = await Promise.all([findInvitationByToken(token), getCurrentUser()]);
  const next = `/invite/${token}`;
  return (
    <div className="min-h-dvh px-4 py-6">
      <BrandMark />
      <main id="main" className="mx-auto mt-10 max-w-md">
        <Card className="p-6 sm:p-8">
          {!found || !found.usable ? (
            <>
              <h1 className="font-serif text-2xl font-semibold text-plum-900">Invitation unavailable</h1>
              <Notice tone="danger" className="mt-4">This invitation is invalid, has expired, or has already been used. Ask the community for a new one.</Notice>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">{found.invitation.invitedBy.name} invited you to join</p>
              <h1 className="mt-1 font-serif text-2xl font-semibold text-plum-900">{found.invitation.organization.name}</h1>
              {found.invitation.roles.some((r) => r !== "MEMBER") && (
                <p className="mt-2 text-sm">
                  Role: {found.invitation.roles.filter((r) => r !== "MEMBER").map((r) => ROLE_LABELS[r]).join(", ")}
                </p>
              )}
              {!user ? (
                <div className="mt-6 space-y-3">
                  <p className="text-sm text-muted">Sign in or create an account with <strong>{found.invitation.email}</strong> to accept.</p>
                  <LinkButton href={`/register?next=${encodeURIComponent(next)}`} className="w-full">Create account</LinkButton>
                  <LinkButton href={`/login?next=${encodeURIComponent(next)}`} variant="secondary" className="w-full">Sign in</LinkButton>
                </div>
              ) : user.email.toLowerCase() !== found.invitation.email.toLowerCase() ? (
                <Notice tone="warning" className="mt-6">
                  This invitation was sent to a different email address. You are signed in as {user.email}. Sign out and sign in with the invited address to accept it.
                </Notice>
              ) : (
                <ActionForm action={acceptInvitationAction} className="mt-6">
                  <input type="hidden" name="token" value={token} />
                  <SubmitButton className="w-full">Accept invitation</SubmitButton>
                </ActionForm>
              )}
            </>
          )}
          <Link href="/" className="mt-6 inline-block text-sm text-muted underline">Back to home</Link>
        </Card>
      </main>
    </div>
  );
}
