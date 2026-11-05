import Link from "next/link";
import { DateTime } from "luxon";
import { ArrowRight, BookOpen, CalendarDays, HandHeart, Megaphone, MessageCircle, MessageSquareHeart, Mic, Plus, Sparkles, UsersRound, Video, type LucideIcon } from "lucide-react";
import type { MeetingMode } from "@prisma/client";
import { Avatar } from "@/components/ui/avatar";
import { PostCard } from "@/components/feed/post-card";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { listUpcomingOccurrences, isOccurrenceJoinable } from "@/server/meetings/service";
import { listProgrammes, PROGRAMME_TYPE_LABELS } from "@/server/programmes/service";
import { getEntitlements } from "@/server/billing/entitlements";
import { FEED_FILTERS, getFeed, type FeedFilter } from "@/server/social/service";
import { can } from "@/server/tenancy/context";
import { db } from "@/server/db";
import { isValidTimezone } from "@/lib/time";
import { daysAgo, now } from "@/lib/clock";
import { cn } from "@/lib/utils";

const MODE: Record<MeetingMode, { label: string; icon: LucideIcon }> = {
  WHATSAPP: { label: "WhatsApp", icon: MessageCircle },
  AUDIO: { label: "Audio", icon: Mic },
  VIDEO: { label: "Video", icon: Video },
};

const FILTER_LABELS: Record<FeedFilter, string> = { all: "Everything", prayer: "Prayer requests", testimonies: "Testimonies", announcements: "Announcements" };

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function RailCard({ title, icon: Icon, action, children }: { title: string; icon: LucideIcon; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line/80 bg-surface p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-plum-900"><Icon className="size-[1.1rem] text-plum-700" aria-hidden /> {title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function OrgHome({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ filter?: string; before?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const filter: FeedFilter = (FEED_FILTERS as readonly string[]).includes(sp.filter ?? "") ? (sp.filter as FeedFilter) : "all";
  const beforeDate = sp.before ? new Date(sp.before) : undefined;
  const before = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : undefined;

  const ctx = await pageOrgContext(slug);
  const user = (await getCurrentUser())!;
  const tz = isValidTimezone(user.timezone) ? user.timezone : "UTC";
  const ent = await getEntitlements(ctx.org.id);
  const prayerOn = ent.features.has("feature.prayer_requests");
  const programmesOn = ent.features.has("feature.programmes");
  const isAdmin = can(ctx, "org.settings") || can(ctx, "members.manage");
  const canAnnounce = can(ctx, "content.publish");

  const [feed, occurrences, programmes, groups, stats] = await Promise.all([
    getFeed(ctx, { before, filter, prayerEnabled: prayerOn }),
    listUpcomingOccurrences(ctx, { days: 7, take: 8 }),
    programmesOn ? listProgrammes(ctx) : Promise.resolve([]),
    db.groupMembership.findMany({
      where: { organizationId: ctx.org.id, userId: ctx.actor.id, group: { archivedAt: null } },
      include: { group: { select: { id: true, name: true, _count: { select: { members: true } } } } },
      take: 6,
    }),
    isAdmin
      ? Promise.all([
          db.membership.count({ where: { organizationId: ctx.org.id, status: "ACTIVE" } }),
          db.membership.count({ where: { organizationId: ctx.org.id, status: "PENDING" } }),
          db.prayerAcknowledgement.count({ where: { request: { organizationId: ctx.org.id }, createdAt: { gte: daysAgo(7) } } }),
        ])
      : Promise.resolve(null),
  ]);

  const local = DateTime.fromJSDate(now()).setZone(tz);
  const myName = user.displayName ?? user.name;
  const firstName = myName.split(" ")[0];
  const myProgrammes = programmes.filter((p) => p.enrollments.length > 0).slice(0, 2);
  const filterHref = (f: FeedFilter) => (f === "all" ? `/o/${slug}` : `/o/${slug}?filter=${f}`);
  const next = occurrences[0];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="mx-auto w-full min-w-0 max-w-2xl space-y-4">
        {/* Gatherings rail */}
        <section aria-label="Live and upcoming gatherings" className="rounded-2xl border border-line/80 bg-surface p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-plum-900">{greeting(local.hour)}, {firstName}</p>
            <Link href={`/o/${slug}/meetings`} className="text-xs font-semibold text-plum-700 hover:underline">Calendar</Link>
          </div>
          <ul className="-mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {can(ctx, "meetings.create") && (
              <li className="shrink-0">
                <Link href={`/o/${slug}/admin/meetings/new`} className="flex w-[4.75rem] flex-col items-center gap-1.5 text-center">
                  <span className="flex size-16 items-center justify-center rounded-full border-2 border-dashed border-line text-plum-700 transition hover:border-plum-700/40 hover:bg-violet-50"><Plus className="size-6" aria-hidden /></span>
                  <span className="text-[0.7rem] font-medium leading-tight text-ink/70">Schedule</span>
                </Link>
              </li>
            )}
            {occurrences.length === 0 && <li className="self-center text-sm text-muted">No gatherings in the next 7 days.</li>}
            {occurrences.map((o) => {
              const live = isOccurrenceJoinable(o, now(), 0) && o.startsAt <= now();
              const start = DateTime.fromJSDate(o.startsAt).setZone(tz);
              const Icon = MODE[o.meeting.mode].icon;
              return (
                <li key={o.id} className="shrink-0">
                  <Link href={`/o/${slug}/meetings/${o.id}`} className="flex w-[4.75rem] flex-col items-center gap-1.5 text-center" aria-label={`${o.meeting.title}, ${live ? "live now" : start.toFormat("cccc HH:mm")}`}>
                    <span className={cn("relative flex size-16 items-center justify-center rounded-full p-[3px]", live ? "bg-gradient-to-tr from-gold-500 via-rose-400 to-gold-400" : "bg-gradient-to-tr from-plum-700/40 to-gold-400/60")}>
                      <span className="flex size-full items-center justify-center rounded-full border-2 border-surface bg-plum-900 text-gold-400"><Icon className="size-6" aria-hidden /></span>
                      {live && <span className="absolute -bottom-1 rounded-full bg-rose-600 px-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-white">Live</span>}
                    </span>
                    <span className="line-clamp-2 text-[0.7rem] font-medium leading-tight text-plum-900">{o.meeting.title}</span>
                    <span className="text-[0.65rem] text-muted">{live ? "Join now" : start.hasSame(local, "day") ? start.toFormat("HH:mm") : start.toFormat("ccc HH:mm")}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Composer */}
        <section aria-label="Share with the community" className="rounded-2xl border border-line/80 bg-surface p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <Avatar name={myName} src={user.avatarUrl} size={44} />
            <Link href={prayerOn ? `/o/${slug}/prayer/new` : `/o/${slug}/testimonies#share`} className="flex-1 rounded-full bg-canvas px-4 py-3 text-sm text-muted transition hover:bg-violet-50">
              {prayerOn ? `What can we pray with you about, ${firstName}?` : `Share what God has done, ${firstName}…`}
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-1 border-t border-line/70 pt-2">
            {prayerOn && (
              <Link href={`/o/${slug}/prayer/new`} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-ink/75 hover:bg-violet-50"><HandHeart className="size-[1.1rem] text-plum-700" aria-hidden /> Prayer request</Link>
            )}
            <Link href={`/o/${slug}/testimonies#share`} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-ink/75 hover:bg-violet-50"><Sparkles className="size-[1.1rem] text-gold-600" aria-hidden /> Testimony</Link>
            {canAnnounce && (
              <Link href={`/o/${slug}/admin/content`} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-ink/75 hover:bg-violet-50"><Megaphone className="size-[1.1rem] text-plum-700" aria-hidden /> Announcement</Link>
            )}
          </div>
        </section>

        {/* Filters */}
        <nav aria-label="Filter the feed" className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none]">
          {FEED_FILTERS.filter((f) => f !== "prayer" || prayerOn).map((f) => (
            <Link key={f} href={filterHref(f)} aria-current={f === filter ? "page" : undefined} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition", f === filter ? "bg-plum-900 text-white" : "border border-line bg-surface text-ink/70 hover:bg-violet-50")}>
              {FILTER_LABELS[f]}
            </Link>
          ))}
        </nav>

        {/* Feed */}
        {feed.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
            <MessageSquareHeart className="mx-auto size-10 text-plum-700/40" aria-hidden />
            <p className="mt-3 font-semibold text-plum-900">{before ? "You're all caught up" : "Nothing here yet"}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{before ? "You've seen everything shared in this community." : "Share a prayer request or a testimony to get the conversation started."}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {feed.items.map((item) => <PostCard key={`${item.kind}-${item.id}`} item={item} slug={slug} />)}
          </div>
        )}
        {feed.nextBefore && (
          <Link href={`/o/${slug}?${new URLSearchParams({ ...(filter !== "all" ? { filter } : {}), before: feed.nextBefore.toISOString() })}`} className="block rounded-2xl border border-line bg-surface py-3 text-center text-sm font-semibold text-plum-700 shadow-[var(--shadow-card)] hover:bg-violet-50">
            Show older posts
          </Link>
        )}
        {before && <Link href={filterHref(filter)} className="block text-center text-sm font-medium text-plum-700 hover:underline">Back to the latest</Link>}
      </div>

      {/* Side rail */}
      <aside className="mx-auto w-full max-w-2xl space-y-4 xl:max-w-none" aria-label="Your community">
        <section className="relative overflow-hidden rounded-2xl bg-plum-900 p-5 text-white shadow-[var(--shadow-lift)]">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(20rem_12rem_at_100%_0%,rgba(197,161,74,0.35),transparent_65%)]" />
          <div className="relative">
            <p className="text-xs text-white/60">{local.toFormat("cccc, d LLLL")}</p>
            <p className="mt-1 font-serif text-xl leading-snug">{ctx.org.name}</p>
            {ctx.org.tagline && <p className="mt-1 text-sm text-white/70">{ctx.org.tagline}</p>}
            {next && (
              <Link href={`/o/${slug}/meetings/${next.id}`} className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15 transition hover:bg-white/15">
                <span className="min-w-0">
                  <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-gold-400">Next gathering</span>
                  <span className="block truncate text-sm font-semibold">{next.meeting.title}</span>
                  <span className="block text-xs text-white/60">{DateTime.fromJSDate(next.startsAt).setZone(tz).toFormat("ccc d LLL · HH:mm")}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-gold-400" aria-hidden />
              </Link>
            )}
          </div>
        </section>

        {stats && (
          <RailCard title="This week" icon={Sparkles}>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Members", value: stats[0], href: `/o/${slug}/admin/members` },
                { label: "Waiting to join", value: stats[1], href: `/o/${slug}/admin/members?status=PENDING` },
                { label: "Prayers", value: stats[2], href: `/o/${slug}/prayer` },
              ].map((s) => (
                <Link key={s.label} href={s.href} className="rounded-xl bg-canvas px-2 py-3 transition hover:bg-violet-50">
                  <span className={cn("block font-serif text-2xl leading-none", s.label === "Waiting to join" && s.value > 0 ? "text-gold-600" : "text-plum-900")}>{s.value.toLocaleString("en")}</span>
                  <span className="mt-1 block text-[0.65rem] font-medium uppercase tracking-wider text-muted">{s.label}</span>
                </Link>
              ))}
            </div>
          </RailCard>
        )}

        <RailCard title="Your groups" icon={UsersRound} action={<Link href={`/o/${slug}/groups`} className="text-xs font-semibold text-plum-700 hover:underline">See all</Link>}>
          {groups.length === 0 ? (
            <p className="text-sm text-muted">Pray with a smaller circle. <Link href={`/o/${slug}/groups`} className="font-medium text-plum-700 underline">Find a group</Link></p>
          ) : (
            <ul className="space-y-1">
              {groups.map((g) => (
                <li key={g.group.id}>
                  <Link href={`/o/${slug}/groups/${g.group.id}`} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-violet-50">
                    <Avatar name={g.group.name} size={36} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-plum-900">{g.group.name}</span>
                      <span className="block text-xs text-muted">{g.group._count.members} members</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </RailCard>

        {programmesOn && (
          <RailCard title="Your programmes" icon={BookOpen}>
            {myProgrammes.length === 0 ? (
              <p className="text-sm text-muted">Bible plans and prayer challenges. <Link href={`/o/${slug}/programmes`} className="font-medium text-plum-700 underline">Browse</Link></p>
            ) : (
              <ul className="space-y-2">
                {myProgrammes.map((p) => {
                  const day = Math.floor(local.startOf("day").diff(DateTime.fromISO(p.startDate, { zone: ctx.org.timezone }), "days").days) + 1;
                  const pct = Math.max(0, Math.min(100, Math.round((day / p.durationDays) * 100)));
                  return (
                    <li key={p.id}>
                      <Link href={`/o/${slug}/programmes/${p.id}`} className="block rounded-xl bg-canvas p-3 transition hover:bg-violet-50">
                        <p className="text-[0.7rem] font-medium text-gold-600">{PROGRAMME_TYPE_LABELS[p.type]}</p>
                        <p className="text-sm font-medium text-plum-900">{p.title}</p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden><div className="h-full rounded-full bg-gold-500" style={{ width: `${pct}%` }} /></div>
                        <p className="mt-1 text-xs text-muted">{day < 1 ? `Starts ${p.startDate}` : day > p.durationDays ? "Completed period" : `Day ${day} of ${p.durationDays}`}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </RailCard>
        )}

        <RailCard title="Quick links" icon={CalendarDays}>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {[
              { href: `/o/${slug}/meetings`, label: "Meetings" },
              { href: `/o/${slug}/prayer-points`, label: "Prayer points" },
              ...(prayerOn ? [{ href: `/o/${slug}/prayer`, label: "Prayer wall" }] : []),
              ...(ctx.org.fundraisingEnabled ? [{ href: `/o/${slug}/give`, label: "Give" }] : []),
            ].map((l) => (
              <li key={l.href}><Link href={l.href} className="block rounded-xl bg-canvas px-3 py-2.5 font-medium text-plum-900 hover:bg-violet-50">{l.label}</Link></li>
            ))}
          </ul>
        </RailCard>
      </aside>
    </div>
  );
}
