import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { ArrowLeft, BookOpen, CalendarDays, HandHeart, Lock, Megaphone, Pin, Plus, Users } from "lucide-react";
import { Card, Notice } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { InlineAction } from "@/components/ui/inline-action";
import { pageOrgContext } from "@/server/page";
import { getGroupOverview } from "@/server/groups/overview";
import { NotFoundError } from "@/server/errors";
import { prayerAuthorLabel } from "@/server/prayer/access";
import { can } from "@/server/tenancy/context";
import { isValidTimezone } from "@/lib/time";
import { groupMembershipAction } from "../../actions";

export const metadata = { title: "Group" };

const MODE_LABEL = { WHATSAPP: "WhatsApp", AUDIO: "Audio", VIDEO: "Video" } as const;

function Section({ icon: Icon, title, action, children }: { icon: typeof Users; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-plum-900"><Icon className="size-5 text-plum-700" aria-hidden /> {title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function AddLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-plum-900 transition hover:bg-violet-50">
      <Plus className="size-3.5" aria-hidden /> {children}
    </Link>
  );
}

export default async function GroupPage({ params }: { params: Promise<{ slug: string; groupId: string }> }) {
  const { slug, groupId } = await params;
  const ctx = await pageOrgContext(slug);
  let data;
  try {
    data = await getGroupOverview(ctx, groupId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { group, membership, canSeeInside, meetings, announcements, prayers, programmes, members } = data;
  const tz = isValidTimezone(ctx.org.timezone) ? ctx.org.timezone : "UTC";
  const canMeet = can(ctx, "meetings.create");
  const canAnnounce = can(ctx, "content.publish");
  const canProgramme = can(ctx, "programmes.manage");
  const toggle = (
    <InlineAction action={groupMembershipAction.bind(null, slug)} fields={{ groupId: group.id, op: membership ? "leave" : "join" }} variant={membership ? "secondary" : "gold"}>
      {membership ? "Leave group" : "Join this group"}
    </InlineAction>
  );

  return (
    <>
      <Link href={`/o/${slug}/groups`} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-plum-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All groups
      </Link>

      <section className="relative overflow-hidden rounded-3xl bg-plum-950 p-6 text-white shadow-[var(--shadow-lift)] sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-gold-500/15 blur-3xl" />
        <p className="eyebrow text-gold-400">Group</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl font-semibold sm:text-4xl">{group.name}</h1>
          {membership && <Badge tone="success">{membership.role === "LEADER" ? "You lead this group" : "You're a member"}</Badge>}
        </div>
        {group.description && <p className="mt-3 max-w-2xl text-white/80">{group.description}</p>}
        <p className="mt-3 flex items-center gap-1.5 text-sm text-white/70"><Users className="size-4" aria-hidden /> {group._count.members} {group._count.members === 1 ? "member" : "members"}</p>
        <div className="mt-5">{toggle}</div>
      </section>

      {!canSeeInside ? (
        <Card className="mt-6 text-center">
          <Lock className="mx-auto size-8 text-plum-700/60" aria-hidden />
          <p className="mt-3 font-semibold text-plum-900">Join to see what this group shares</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">Group meetings, announcements, prayer requests and programmes are visible only to the group&apos;s members.</p>
        </Card>
      ) : (
        <>
          {!membership && <Notice className="mt-6" title="You're viewing as an administrator">You can see this group because of your role. Join it to receive its meetings on your dashboard.</Notice>}
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-6">
              <Section icon={CalendarDays} title="Upcoming group meetings" action={canMeet && <AddLink href={`/o/${slug}/admin/meetings/new?group=${group.id}`}>Schedule</AddLink>}>
                {meetings.length === 0 ? (
                  <p className="text-sm text-muted">No group meetings scheduled.{canMeet ? " Schedule one and choose this group as the audience." : " Your group leader will add them here."}</p>
                ) : (
                  <ul className="space-y-2">
                    {meetings.map((o) => (
                      <li key={o.id}>
                        <Link href={`/o/${slug}/meetings/${o.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line/70 px-4 py-3 transition hover:border-plum-700/30 hover:bg-violet-50/50">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-plum-900">{o.meeting.title}</p>
                            <p className="text-sm text-muted">{DateTime.fromJSDate(o.startsAt).setZone(tz).toFormat("ccc d LLL · HH:mm")}{o.meeting.theme ? ` · ${o.meeting.theme}` : ""}</p>
                          </div>
                          <Badge>{MODE_LABEL[o.meeting.mode]}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section icon={HandHeart} title="Group prayer requests" action={membership && <AddLink href={`/o/${slug}/prayer/new?group=${group.id}`}>Ask for prayer</AddLink>}>
                {prayers.length === 0 ? (
                  <p className="text-sm text-muted">No requests shared with this group yet. When you ask for prayer, choose &ldquo;A group I belong to&rdquo; to share it only here.</p>
                ) : (
                  <ul className="space-y-3">
                    {prayers.map((r) => (
                      <li key={r.id}>
                        <Link href={`/o/${slug}/prayer/${r.id}`} className="block rounded-xl bg-canvas p-4 transition hover:bg-violet-50">
                          <p className="font-medium text-plum-900">{r.title}</p>
                          <p className="mt-1 text-xs text-muted">{r._count.acknowledgements} praying · {prayerAuthorLabel(r, r.author.name, ctx.actor.id)}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>

            <div className="space-y-6">
              <Section icon={Megaphone} title="Announcements" action={canAnnounce && <AddLink href={`/o/${slug}/admin/content?group=${group.id}`}>Post</AddLink>}>
                {announcements.length === 0 ? (
                  <p className="text-sm text-muted">No group announcements yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {announcements.map((a) => (
                      <li key={a.id} className="rounded-xl bg-canvas p-4">
                        <p className="flex items-center gap-1.5 font-medium text-plum-900">{a.pinned && <Pin className="size-3.5 text-gold-600" aria-label="Pinned" />}{a.title}</p>
                        <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-ink/80">{a.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {(programmes.length > 0 || canProgramme) && (
                <Section icon={BookOpen} title="Programmes" action={canProgramme && <AddLink href={`/o/${slug}/admin/programmes`}>Create</AddLink>}>
                  {programmes.length === 0 ? (
                    <p className="text-sm text-muted">No group programmes yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {programmes.map((p) => (
                        <li key={p.id}><Link href={`/o/${slug}/programmes/${p.id}`} className="block rounded-xl bg-canvas p-3 font-medium text-plum-900 hover:bg-violet-50">{p.title}</Link></li>
                      ))}
                    </ul>
                  )}
                </Section>
              )}

              <Section icon={Users} title="Members">
                <ul className="flex flex-wrap gap-2">
                  {members.map((m) => (
                    <li key={m.id}>
                      <Link href={`/o/${slug}/members/${m.user.id}`} className="inline-flex items-center gap-2 rounded-full bg-violet-50 py-1 pl-1 pr-3 text-sm text-plum-900 hover:bg-violet-100">
                        <Avatar name={m.user.name} src={m.user.avatarUrl} size={24} />
                        {m.user.name}{m.role === "LEADER" && <span className="text-xs font-semibold text-gold-600">Leader</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
