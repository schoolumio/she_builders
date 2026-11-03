import Link from "next/link";
import { DateTime } from "luxon";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Gift,
  HandHeart,
  Megaphone,
  MessageCircle,
  MessageSquareHeart,
  Mic,
  Pin,
  Plus,
  Sparkles,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { MeetingMode } from "@prisma/client";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { listUpcomingOccurrences, isOccurrenceJoinable } from "@/server/meetings/service";
import { listAnnouncementsForMember, listPrayerPoints } from "@/server/content/service";
import { listPrayerRequests } from "@/server/prayer/service";
import { prayerAuthorLabel } from "@/server/prayer/access";
import { listProgrammes, PROGRAMME_TYPE_LABELS } from "@/server/programmes/service";
import { getEntitlements } from "@/server/billing/entitlements";
import { can } from "@/server/tenancy/context";
import { db } from "@/server/db";
import { isValidTimezone } from "@/lib/time";
import { daysAgo, now } from "@/lib/clock";
import { cn } from "@/lib/utils";

const MODE: Record<MeetingMode, { label: string; icon: LucideIcon; tone: string }> = {
  WHATSAPP: { label: "WhatsApp", icon: MessageCircle, tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  AUDIO: { label: "Audio", icon: Mic, tone: "bg-violet-100 text-plum-800 ring-violet-100" },
  VIDEO: { label: "Video", icon: Video, tone: "bg-gold-100 text-gold-600 ring-gold-100" },
};

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function OrgHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug);
  const user = (await getCurrentUser())!;
  const tz = isValidTimezone(user.timezone) ? user.timezone : "UTC";
  const ent = await getEntitlements(ctx.org.id);
  const prayerOn = ent.features.has("feature.prayer_requests");
  const programmesOn = ent.features.has("feature.programmes");
  const isAdmin = can(ctx, "org.settings") || can(ctx, "members.manage");

  const [occurrences, points, announcements, prayers, programmes, stats] = await Promise.all([
    listUpcomingOccurrences(ctx, { days: 7, take: 7 }),
    listPrayerPoints(ctx, { take: 1 }),
    listAnnouncementsForMember(ctx, 3),
    prayerOn ? listPrayerRequests(ctx, { scope: "community", take: 3 }) : Promise.resolve([]),
    programmesOn ? listProgrammes(ctx) : Promise.resolve([]),
    isAdmin
      ? Promise.all([
          db.membership.count({ where: { organizationId: ctx.org.id, status: "ACTIVE" } }),
          db.membership.count({ where: { organizationId: ctx.org.id, status: "PENDING" } }),
          db.meetingAttendance.count({ where: { organizationId: ctx.org.id, createdAt: { gte: daysAgo(7) } } }),
          db.prayerAcknowledgement.count({ where: { request: { organizationId: ctx.org.id }, createdAt: { gte: daysAgo(7) } } }),
        ])
      : Promise.resolve(null),
  ]);

  const local = DateTime.fromJSDate(now()).setZone(tz);
  const next = occurrences[0];
  const live = next ? isOccurrenceJoinable(next, now(), 0) && next.startsAt <= now() : false;
  const today = points[0];
  const myProgrammes = programmes.filter((p) => p.enrollments.length > 0).slice(0, 2);
  const firstName = (user.displayName ?? user.name).split(" ")[0];

  // Group this week's sessions by local day.
  const days = new Map<string, typeof occurrences>();
  const shown = occurrences.slice(0, 6);
  for (const o of shown) {
    const key = DateTime.fromJSDate(o.startsAt).setZone(tz).toISODate()!;
    days.set(key, [...(days.get(key) ?? []), o]);
  }

  const actions = [
    ...(prayerOn ? [{ href: `/o/${slug}/prayer/new`, icon: HandHeart, title: "Share a prayer request", body: "You choose who can see it", tone: "from-violet-100 to-violet-50 text-plum-800" }] : []),
    { href: `/o/${slug}/meetings`, icon: CalendarDays, title: "Meetings calendar", body: "Join or add to your calendar", tone: "from-gold-100 to-[#fbf7ea] text-gold-600" },
    { href: `/o/${slug}/testimonies`, icon: MessageSquareHeart, title: "Share a testimony", body: "Encourage the community", tone: "from-rose-100 to-rose-50 text-rose-800" },
    ...(ctx.org.fundraisingEnabled
      ? [{ href: `/o/${slug}/give`, icon: Gift, title: "Give", body: "Support the ministry", tone: "from-emerald-100 to-emerald-50 text-emerald-800" }]
      : programmesOn
        ? [{ href: `/o/${slug}/programmes`, icon: BookOpen, title: "Programmes", body: "Bible studies and challenges", tone: "from-sky-100 to-sky-50 text-sky-800" }]
        : []),
  ];

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <section className="relative overflow-hidden rounded-3xl bg-plum-900 text-white shadow-[var(--shadow-lift)]">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(36rem_18rem_at_100%_0%,rgba(197,161,74,0.30),transparent_65%),radial-gradient(28rem_18rem_at_0%_120%,rgba(74,95,174,0.45),transparent_60%)]" />
        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:p-10">
          <div>
            <p className="text-sm text-white/65">{local.toFormat("cccc, d LLLL")}</p>
            <h1 className="mt-2 font-serif text-[2rem] font-medium leading-tight sm:text-[2.6rem]">
              {greeting(local.hour)}, <span className="italic text-gold-400">{firstName}</span>
            </h1>
            <p className="mt-3 max-w-md leading-7 text-white/70">Welcome to {ctx.org.name}. Here&apos;s what&apos;s happening in your community.</p>
            {can(ctx, "meetings.create") && (
              <Link href={`/o/${slug}/admin/meetings/new`} className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/15">
                <Plus className="size-4" aria-hidden /> Schedule a meeting
              </Link>
            )}
          </div>
          <div className="rounded-2xl bg-white/[0.07] p-5 ring-1 ring-white/15 backdrop-blur">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold-400">
              {live ? <><span className="size-2 animate-pulse rounded-full bg-emerald-400" /> Live now</> : "Next gathering"}
            </p>
            {next ? (
              <>
                <p className="mt-3 font-serif text-2xl leading-snug">{next.meeting.title}</p>
                <p className="mt-1 text-sm text-white/70">
                  {DateTime.fromJSDate(next.startsAt).setZone(tz).toFormat("ccc d LLL · HH:mm")}
                  {!live && <> · {DateTime.fromJSDate(next.startsAt).toRelative({ base: DateTime.fromJSDate(now()) })}</>}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Link href={`/o/${slug}/meetings/${next.id}`} className="inline-flex items-center gap-2 rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-plum-950 transition hover:bg-gold-400">
                    {live ? "Join now" : "View & join"} <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  <span className="inline-flex items-center gap-1.5 text-xs text-white/60">
                    {(() => {
                      const Icon = MODE[next.meeting.mode].icon;
                      return <Icon className="size-3.5" aria-hidden />;
                    })()}
                    {MODE[next.meeting.mode].label}
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-3 text-white/70">No meetings scheduled in the next 7 days.</p>
            )}
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section aria-label="Quick actions" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {actions.map(({ href, icon: Icon, title, body, tone }) => (
          <Link key={href} href={href} className="group rounded-2xl border border-line/80 bg-surface p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] sm:p-5">
            <span className={cn("flex size-11 items-center justify-center rounded-xl bg-gradient-to-br", tone)}>
              <Icon className="size-5" aria-hidden />
            </span>
            <p className="mt-4 font-semibold leading-snug text-plum-900">{title}</p>
            <p className="mt-0.5 text-sm text-muted">{body}</p>
          </Link>
        ))}
      </section>

      {/* Leaders' pulse */}
      {stats && (
        <section aria-label="Community at a glance" className="grid grid-cols-2 gap-3 rounded-2xl border border-line/80 bg-surface p-2 shadow-[var(--shadow-card)] lg:grid-cols-4">
          {[
            { label: "Active members", value: stats[0], href: `/o/${slug}/admin/members` },
            { label: "Join requests", value: stats[1], href: `/o/${slug}/admin/members?status=PENDING`, attention: stats[1] > 0 },
            { label: "Attendance · 7 days", value: stats[2], href: `/o/${slug}/admin/meetings` },
            { label: "Prayers · 7 days", value: stats[3], href: `/o/${slug}/prayer` },
          ].map((s) => (
            <Link key={s.label} href={s.href} className="rounded-xl p-4 transition hover:bg-violet-50">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{s.label}</p>
              <p className={cn("mt-2 font-serif text-3xl font-medium leading-none", s.attention ? "text-gold-600" : "text-plum-900")}>{s.value.toLocaleString("en")}</p>
            </Link>
          ))}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          {/* This week */}
          <section className="rounded-2xl border border-line/80 bg-surface p-6 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-plum-900">This week</h2>
              <Link href={`/o/${slug}/meetings`} className="inline-flex items-center gap-1 text-sm font-medium text-plum-700 hover:underline">
                All meetings <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
            {days.size === 0 ? (
              <p className="mt-4 text-sm text-muted">Nothing scheduled in the next 7 days.</p>
            ) : (
              <ol className="mt-5 space-y-5">
                {[...days.entries()].map(([day, list]) => {
                  const d = DateTime.fromISO(day, { zone: tz });
                  const isToday = d.hasSame(local, "day");
                  return (
                    <li key={day} className="flex gap-4">
                      <div className={cn("flex w-14 shrink-0 flex-col items-center self-start rounded-xl py-2", isToday ? "bg-plum-900 text-white" : "bg-canvas text-plum-900")}>
                        <span className={cn("text-[0.65rem] font-semibold uppercase tracking-wider", isToday ? "text-gold-400" : "text-muted")}>{isToday ? "Today" : d.toFormat("ccc")}</span>
                        <span className="font-serif text-2xl leading-none">{d.toFormat("d")}</span>
                      </div>
                      <ul className="min-w-0 flex-1 space-y-2">
                        {list.map((o) => {
                          const m = MODE[o.meeting.mode];
                          return (
                            <li key={o.id}>
                              <Link href={`/o/${slug}/meetings/${o.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line/70 px-4 py-3 transition hover:border-plum-700/30 hover:bg-violet-50/50">
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-plum-900">{o.meeting.title}</p>
                                  <p className="text-sm text-muted">{DateTime.fromJSDate(o.startsAt).setZone(tz).toFormat("HH:mm")}{o.meeting.theme ? ` · ${o.meeting.theme}` : ""}</p>
                                </div>
                                <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1", m.tone)}>
                                  <m.icon className="size-3.5" aria-hidden /> {m.label}
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            )}
            {occurrences.length > shown.length && (
              <Link href={`/o/${slug}/meetings`} className="mt-4 block rounded-xl border border-dashed border-line py-2.5 text-center text-sm font-medium text-plum-700 hover:bg-violet-50">
                More this week in Meetings
              </Link>
            )}
          </section>

          {/* Announcements */}
          <section className="rounded-2xl border border-line/80 bg-surface p-6 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-plum-900"><Megaphone className="size-5 text-plum-700" aria-hidden /> Announcements</h2>
              <Link href={`/o/${slug}/announcements`} className="text-sm font-medium text-plum-700 hover:underline">See all</Link>
            </div>
            {announcements.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No announcements yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {announcements.map((a) => (
                  <li key={a.id} className="py-4 first:pt-1 last:pb-0">
                    <p className="flex items-center gap-2 font-semibold text-plum-900">
                      {a.pinned && <Pin className="size-4 text-gold-600" aria-label="Pinned" />}
                      {a.title}
                    </p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm leading-6 text-muted">{a.body}</p>
                    {a.publishedAt && <p className="mt-1.5 text-xs text-muted/80">{DateTime.fromJSDate(a.publishedAt).toRelative({ base: DateTime.fromJSDate(now()) })}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {/* Prayer point */}
          <section className="relative overflow-hidden rounded-2xl border border-gold-500/30 bg-gradient-to-br from-[#fbf6e6] via-surface to-surface p-6 shadow-[var(--shadow-card)]">
            <Sparkles aria-hidden className="absolute -right-3 -top-3 size-24 text-gold-500/10" />
            <p className="eyebrow text-gold-600">Today&apos;s prayer point</p>
            {today ? (
              <>
                <h2 className="mt-3 font-serif text-[1.6rem] font-medium leading-snug text-plum-900">{today.title}</h2>
                <p className="mt-3 whitespace-pre-line leading-7 text-ink/80">{today.body}</p>
                {today.scriptureRefs.length > 0 && (
                  <p className="mt-4 inline-flex rounded-full bg-gold-100 px-3 py-1 text-sm font-medium text-gold-600">{today.scriptureRefs.join(" · ")}</p>
                )}
                <Link href={`/o/${slug}/prayer-points`} className="mt-5 flex items-center gap-1 text-sm font-medium text-plum-700 hover:underline">
                  Earlier prayer points <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">Your leaders haven&apos;t published a prayer point yet.</p>
            )}
          </section>

          {/* Prayer wall */}
          {prayerOn && (
            <section className="rounded-2xl border border-line/80 bg-surface p-6 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-plum-900"><HandHeart className="size-5 text-plum-700" aria-hidden /> Pray with the community</h2>
              </div>
              {prayers.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No shared requests yet. Be the first to ask for prayer.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {prayers.map((r) => (
                    <li key={r.id}>
                      <Link href={`/o/${slug}/prayer/${r.id}`} className="block rounded-xl bg-canvas p-4 transition hover:bg-violet-50">
                        <p className="font-medium text-plum-900">{r.title}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                          <Users className="size-3.5" aria-hidden /> {r._count.acknowledgements} praying · {prayerAuthorLabel(r, r.author.name, user.id)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex gap-3">
                <Link href={`/o/${slug}/prayer/new`} className="inline-flex flex-1 items-center justify-center rounded-full bg-plum-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-plum-800">Ask for prayer</Link>
                <Link href={`/o/${slug}/prayer`} className="inline-flex flex-1 items-center justify-center rounded-full border border-line px-4 py-2.5 text-sm font-semibold text-plum-900 transition hover:bg-violet-50">Prayer wall</Link>
              </div>
            </section>
          )}

          {/* Programmes */}
          {programmesOn && (
            <section className="rounded-2xl border border-line/80 bg-surface p-6 shadow-[var(--shadow-card)]">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-plum-900"><BookOpen className="size-5 text-plum-700" aria-hidden /> Your programmes</h2>
              {myProgrammes.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  You haven&apos;t joined a programme yet. <Link href={`/o/${slug}/programmes`} className="font-medium text-plum-700 underline">Browse programmes</Link>
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {myProgrammes.map((p) => {
                    const day = Math.floor(local.startOf("day").diff(DateTime.fromISO(p.startDate, { zone: ctx.org.timezone }), "days").days) + 1;
                    const pct = Math.max(0, Math.min(100, Math.round((day / p.durationDays) * 100)));
                    return (
                      <li key={p.id}>
                        <Link href={`/o/${slug}/programmes/${p.id}`} className="block rounded-xl bg-canvas p-4 transition hover:bg-violet-50">
                          <p className="text-xs font-medium text-gold-600">{PROGRAMME_TYPE_LABELS[p.type]}</p>
                          <p className="font-medium text-plum-900">{p.title}</p>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                            <div className="h-full rounded-full bg-gold-500" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-1 text-xs text-muted">{day < 1 ? `Starts ${p.startDate}` : day > p.durationDays ? "Completed period" : `Day ${day} of ${p.durationDays}`}</p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
