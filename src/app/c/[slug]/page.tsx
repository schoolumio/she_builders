import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Card, CardTitle, Notice } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ActionForm, SubmitButton, TextAreaField } from "@/components/ui/form";
import { getCurrentUser } from "@/server/auth/current-user";
import { getPublicOrganization } from "@/server/orgs/service";
import { listPublicTestimonies } from "@/server/content/service";
import { db } from "@/server/db";
import { isCampaignOpen } from "@/server/payments/campaigns";
import { NotFoundError } from "@/server/errors";
import { formatInZone } from "@/lib/time";
import { safeExternalUrl } from "@/lib/urls";
import { joinAction } from "./actions";

async function load(slug: string) {
  const user = await getCurrentUser();
  try {
    return { user, ...(await getPublicOrganization(slug, user?.id)) };
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { org } = await load(slug);
  return { title: org.name, description: org.tagline ?? undefined, robots: org.visibility === "PUBLIC" ? undefined : { index: false } };
}

export default async function PublicOrgPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org, viewerMembership, user } = await load(slug);
  const isMember = viewerMembership?.status === "ACTIVE";
  const [testimonies, campaigns, meetings] = await Promise.all([
    listPublicTestimonies(org.id),
    org.fundraisingEnabled ? db.fundraisingCampaign.findMany({ where: { organizationId: org.id, status: "ACTIVE", visibility: isMember ? undefined : "PUBLIC" }, orderBy: { createdAt: "desc" }, take: 6 }) : Promise.resolve([]),
    db.meetingOccurrence.findMany({ where: { organizationId: org.id, status: "SCHEDULED", startsAt: { gte: new Date() }, meeting: { visibility: "PUBLIC", status: "ACTIVE" } }, include: { meeting: { select: { title: true, timezone: true } } }, orderBy: { startsAt: "asc" }, take: 5 }),
  ]);
  const social = (org.socialLinks ?? {}) as Record<string, string>;
  const accent = org.accentColor && /^#[0-9a-f]{6}$/i.test(org.accentColor) ? org.accentColor : undefined;
  return (
    <div style={accent ? ({ "--org-accent": accent } as React.CSSProperties) : undefined}>
      <div className="h-40 bg-gradient-to-r from-plum-900 to-violet-600 sm:h-56" style={org.coverUrl ? { backgroundImage: `url(${org.coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined} />
      <div className="mx-auto -mt-12 max-w-5xl px-4 pb-16 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="rounded-full border-4 border-canvas"><Avatar name={org.name} src={org.logoUrl} size={96} /></div>
            <div className="pb-1">
              <h1 className="font-serif text-2xl font-semibold text-plum-900 sm:text-3xl">{org.name}</h1>
              {org.tagline && <p className="text-muted">{org.tagline}</p>}
              {org.verification === "VERIFIED" && <Badge tone="success" className="mt-1">Organisation verified by BridgeCodes</Badge>}
            </div>
          </div>
          <div className="flex gap-2">
            {isMember ? <LinkButton href={`/o/${slug}`}>Open community</LinkButton> : null}
          </div>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            {org.description && <Card><CardTitle>About</CardTitle><p className="mt-2 whitespace-pre-line text-sm">{org.description}</p></Card>}
            {campaigns.filter((c) => isCampaignOpen(c)).length > 0 && (
              <Card>
                <CardTitle>Support {org.name}</CardTitle>
                <ul className="mt-3 space-y-3">
                  {campaigns.filter((c) => isCampaignOpen(c)).map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3">
                      <div><p className="font-medium">{c.title}</p><p className="line-clamp-1 text-sm text-muted">{c.description}</p></div>
                      <LinkButton href={`/c/${slug}/give/${c.id}`} size="sm" variant="gold">Give</LinkButton>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {testimonies.length > 0 && (
              <Card>
                <CardTitle>Testimonies</CardTitle>
                <ul className="mt-3 space-y-4">
                  {testimonies.map((t) => (
                    <li key={t.id}><p className="font-medium">{t.title}</p><p className="mt-1 line-clamp-4 whitespace-pre-line text-sm">{t.body}</p><p className="mt-1 text-xs text-muted">— {t.showName ? t.author.name : "A member"}</p></li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
          <div className="space-y-6">
            {!isMember && (
              <Card>
                <CardTitle>Join this community</CardTitle>
                {viewerMembership?.status === "PENDING" ? (
                  <Notice className="mt-3">Your request to join is awaiting approval.</Notice>
                ) : org.joinPolicy === "INVITE_ONLY" ? (
                  <p className="mt-2 text-sm text-muted">Membership is by invitation. Ask the community&apos;s leaders for an invitation link.</p>
                ) : !user ? (
                  <div className="mt-3 space-y-2">
                    <LinkButton href={`/register?next=/c/${slug}`} className="w-full">Create an account to join</LinkButton>
                    <LinkButton href={`/login?next=/c/${slug}`} variant="secondary" className="w-full">Sign in</LinkButton>
                  </div>
                ) : viewerMembership && ["SUSPENDED", "REMOVED"].includes(viewerMembership.status) ? (
                  <p className="mt-2 text-sm text-muted">Please contact the community&apos;s administrators.</p>
                ) : (
                  <ActionForm action={joinAction.bind(null, org.id, slug)} className="mt-3">
                    {org.joinPolicy === "APPROVAL" && <TextAreaField label="A short note to the administrators (optional)" name="message" rows={2} />}
                    <SubmitButton className="w-full">{org.joinPolicy === "OPEN" ? "Join now" : "Request to join"}</SubmitButton>
                  </ActionForm>
                )}
              </Card>
            )}
            {meetings.length > 0 && (
              <Card>
                <CardTitle>Upcoming public meetings</CardTitle>
                <ul className="mt-2 space-y-2 text-sm">{meetings.map((m) => <li key={m.id}><p className="font-medium">{m.meeting.title}</p><p className="text-muted">{formatInZone(m.startsAt, m.meeting.timezone)} ({m.meeting.timezone})</p></li>)}</ul>
              </Card>
            )}
            <Card>
              <CardTitle>Contact</CardTitle>
              <ul className="mt-2 space-y-1 text-sm">
                <li>Based in {org.country}</li>
                {org.contactEmail && <li><a className="underline" href={`mailto:${org.contactEmail}`}>{org.contactEmail}</a></li>}
                {safeExternalUrl(org.websiteUrl) && <li><a className="underline" href={safeExternalUrl(org.websiteUrl)!} target="_blank" rel="noopener noreferrer">Website ↗</a></li>}
                {Object.entries(social).map(([k, v]) => safeExternalUrl(v) && <li key={k}><a className="capitalize underline" href={safeExternalUrl(v)!} target="_blank" rel="noopener noreferrer">{k} ↗</a></li>)}
              </ul>
            </Card>
            <p className="text-center text-xs text-muted"><Link href="/guidelines" className="underline">Community guidelines</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
