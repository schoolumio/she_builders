import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { EmptyState, Notice } from "@/components/ui/card";
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
  const firstName = (user.displayName ?? user.name).split(" ")[0];
  return (
    <>
      <section className="relative mb-8 overflow-hidden rounded-3xl bg-plum-900 p-6 text-white shadow-[var(--shadow-lift)] sm:p-10">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(36rem_18rem_at_100%_0%,rgba(197,161,74,0.28),transparent_65%)]" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow text-gold-400">My communities</p>
            <h1 className="mt-3 font-serif text-[2rem] font-medium leading-tight sm:text-[2.5rem]">
              Welcome, <span className="italic text-gold-400">{firstName}</span>
            </h1>
            <p className="mt-2 max-w-md text-white/70">Choose a community to see today&apos;s meetings, prayer points and requests.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/communities" className="inline-flex items-center rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold ring-1 ring-white/20 transition hover:bg-white/15">Find a community</Link>
            <Link href="/orgs/new" className="inline-flex items-center gap-2 rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-plum-950 transition hover:bg-gold-400">
              <Plus className="size-4" aria-hidden /> Start a community
            </Link>
          </div>
        </div>
      </section>
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
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {memberships.map((m) => (
            <Link
              key={m.id}
              href={m.status === "ACTIVE" ? `/o/${m.organization.slug}` : `/c/${m.organization.slug}`}
              className="group overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
            >
              <div
                className="relative h-24 bg-plum-800 bg-cover bg-center"
                style={m.organization.coverUrl ? { backgroundImage: `url(${m.organization.coverUrl})` } : { backgroundImage: "radial-gradient(18rem 8rem at 100% 0%, rgba(197,161,74,0.35), transparent 70%), linear-gradient(135deg, #0e1530, #233166)" }}
              />
              <div className="relative px-5 pb-5">
                <div className="-mt-7 inline-block rounded-full ring-4 ring-surface">
                  <Avatar name={m.organization.name} src={m.organization.logoUrl} size={56} />
                </div>
                <p className="mt-2 font-semibold text-plum-900">{m.organization.name}</p>
                {m.organization.tagline && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{m.organization.tagline}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.status === "PENDING" && <Badge tone="warning">Awaiting approval</Badge>}
                  {m.organization.status === "SUSPENDED" && <Badge tone="danger">Suspended</Badge>}
                  {m.roles.filter((r) => r !== "MEMBER").map((r) => (
                    <Badge key={r} tone="violet">{ROLE_LABELS[r]}</Badge>
                  ))}
                </div>
                <p className="mt-4 flex items-center gap-1 text-sm font-semibold text-plum-700">
                  {m.status === "ACTIVE" ? "Open community" : "View community"} <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
