import "server-only";
import type { MeetingMode, ReactionType } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { ForbiddenError, NotFoundError } from "../errors";
import { parseInput } from "../validate";
import { rateLimit } from "../rate-limit";
import { notify } from "../notifications";
import type { OrgContext } from "../tenancy/context";
import { can, requireActiveOrg } from "../tenancy/context";
import { myGroupIds } from "../groups/service";
import { prayerViewer, visiblePrayerWhere } from "../prayer/service";
import { canModeratePrayerRequest, canViewPrayerRequest } from "../prayer/access";
import { accessFacts, visibleOccurrenceWhere } from "../meetings/service";

/**
 * Social layer: the community feed, encouragements (comments) and "Amen" reactions.
 * Comments inherit the visibility of the post they belong to: anyone who can read a prayer request
 * or testimony can read and add encouragements on it, and nobody else can.
 */

export type PostTarget = { kind: "prayer"; id: string } | { kind: "testimony"; id: string };

type ResolvedTarget = {
  kind: PostTarget["kind"];
  id: string;
  authorId: string;
  link: string;
  /** Whether the viewer may remove other people's encouragements here. */
  canModerate: boolean;
};

async function resolveTarget(ctx: OrgContext, target: PostTarget): Promise<ResolvedTarget> {
  if (target.kind === "prayer") {
    const req = await db.prayerRequest.findFirst({ where: { id: target.id, organizationId: ctx.org.id } });
    const viewer = await prayerViewer(ctx);
    if (!req || !canViewPrayerRequest(req, viewer)) throw new NotFoundError("Prayer request not found.");
    if (req.moderationStatus !== "APPROVED" && req.authorId !== ctx.actor.id && !canModeratePrayerRequest(req, viewer)) {
      throw new ForbiddenError("This request is awaiting review.");
    }
    return { kind: "prayer", id: req.id, authorId: req.authorId, link: `/o/${ctx.org.slug}/prayer/${req.id}`, canModerate: canModeratePrayerRequest(req, viewer) };
  }
  const t = await db.testimony.findFirst({ where: { id: target.id, organizationId: ctx.org.id } });
  const isModerator = can(ctx, "content.moderate");
  if (!t || (t.moderationStatus !== "APPROVED" && t.authorId !== ctx.actor.id && !isModerator)) throw new NotFoundError("Testimony not found.");
  return { kind: "testimony", id: t.id, authorId: t.authorId, link: `/o/${ctx.org.slug}/testimonies/${t.id}`, canModerate: isModerator };
}

const targetWhere = (t: { kind: PostTarget["kind"]; id: string }) => (t.kind === "prayer" ? { prayerRequestId: t.id } : { testimonyId: t.id });

export async function listComments(ctx: OrgContext, target: PostTarget) {
  const t = await resolveTarget(ctx, target);
  const comments = await db.postComment.findMany({
    where: { organizationId: ctx.org.id, ...targetWhere(t) },
    include: { author: { select: { id: true, name: true, displayName: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return comments.map((c) => ({ ...c, canDelete: c.authorId === ctx.actor.id || t.authorId === ctx.actor.id || t.canModerate }));
}

const commentSchema = z.object({ body: z.string().trim().min(1, { error: "Write a few words of encouragement." }).max(1000) });

export async function addComment(ctx: OrgContext, target: PostTarget, input: unknown) {
  requireActiveOrg(ctx);
  const { body } = parseInput(commentSchema, input);
  const t = await resolveTarget(ctx, target);
  await rateLimit(`comment:${ctx.actor.id}`, 60, 3600);
  const comment = await db.postComment.create({ data: { organizationId: ctx.org.id, authorId: ctx.actor.id, body, ...targetWhere(t) } });
  if (t.authorId !== ctx.actor.id) {
    const who = ctx.actor.name;
    await notify({
      userIds: [t.authorId],
      organizationId: ctx.org.id,
      category: "PRAYER",
      title: t.kind === "prayer" ? `${who} left you an encouragement` : `${who} responded to your testimony`,
      link: t.link,
    });
  }
  return comment;
}

/** Comment authors, the author of the post, and moderators may remove an encouragement. */
export async function deleteComment(ctx: OrgContext, commentId: string) {
  const c = await db.postComment.findFirst({ where: { id: commentId, organizationId: ctx.org.id } });
  if (!c) throw new NotFoundError("Comment not found.");
  const t = await resolveTarget(ctx, c.prayerRequestId ? { kind: "prayer", id: c.prayerRequestId } : { kind: "testimony", id: c.testimonyId! });
  if (c.authorId !== ctx.actor.id && t.authorId !== ctx.actor.id && !t.canModerate) throw new NotFoundError("Comment not found.");
  await db.postComment.delete({ where: { id: c.id } });
  return t;
}

export const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: "AMEN", emoji: "🙏", label: "Amen" },
  { type: "PRAISE", emoji: "🙌", label: "Praise God" },
  { type: "LOVE", emoji: "❤️", label: "Love" },
];
export type ReactionSummary = { counts: Record<ReactionType, number>; total: number; mine: ReactionType | null };

/** React to a testimony. Choosing your current reaction again removes it; another type replaces it. */
export async function react(ctx: OrgContext, testimonyId: string, type: ReactionType) {
  requireActiveOrg(ctx);
  const t = await resolveTarget(ctx, { kind: "testimony", id: testimonyId });
  const existing = await db.testimonyReaction.findUnique({ where: { testimonyId_userId: { testimonyId: t.id, userId: ctx.actor.id } } });
  if (existing?.type === type) {
    await db.testimonyReaction.delete({ where: { id: existing.id } });
    return null;
  }
  await rateLimit(`react:${ctx.actor.id}`, 300, 3600);
  await db.testimonyReaction.upsert({
    where: { testimonyId_userId: { testimonyId: t.id, userId: ctx.actor.id } },
    create: { testimonyId: t.id, userId: ctx.actor.id, type },
    update: { type },
  });
  return type;
}

/** "Amen" toggle. Returns whether the viewer now says Amen. */
export async function toggleAmen(ctx: OrgContext, testimonyId: string) {
  return (await react(ctx, testimonyId, "AMEN")) === "AMEN";
}

async function reactionSummaries(testimonyIds: string[], me: string): Promise<Map<string, ReactionSummary>> {
  const out = new Map<string, ReactionSummary>();
  for (const id of testimonyIds) out.set(id, { counts: { AMEN: 0, PRAISE: 0, LOVE: 0 }, total: 0, mine: null });
  if (!testimonyIds.length) return out;
  const [groups, mine] = await Promise.all([
    db.testimonyReaction.groupBy({ by: ["testimonyId", "type"], where: { testimonyId: { in: testimonyIds } }, _count: { _all: true } }),
    db.testimonyReaction.findMany({ where: { testimonyId: { in: testimonyIds }, userId: me }, select: { testimonyId: true, type: true } }),
  ]);
  for (const g of groups) {
    const s = out.get(g.testimonyId)!;
    s.counts[g.type] = g._count._all;
    s.total += g._count._all;
  }
  for (const m of mine) out.get(m.testimonyId)!.mine = m.type;
  return out;
}

export async function getTestimony(ctx: OrgContext, id: string) {
  const t = await resolveTarget(ctx, { kind: "testimony", id });
  const testimony = await db.testimony.findUniqueOrThrow({
    where: { id: t.id },
    include: { author: { select: authorSelect }, _count: { select: { comments: true } } },
  });
  const reactions = (await reactionSummaries([testimony.id], ctx.actor.id)).get(testimony.id)!;
  const isAuthor = testimony.authorId === ctx.actor.id;
  return { testimony: { ...testimony, author: visibleAuthor(testimony.author, !testimony.showName, ctx.actor.id) }, reactions, isAuthor };
}

// ---------------------------------------------------------------------------------------------
// Prayer sessions
// ---------------------------------------------------------------------------------------------

const personSelect = { id: true, name: true, displayName: true, avatarUrl: true, status: true } as const;
type Person = { id: string; name: string; displayName: string | null; avatarUrl: string | null };
const SOON_MINUTES = 60;

/** Everyone who joined a session (in-app attendance, WhatsApp join taps, host-marked), de-duplicated. */
function participants(o: { attendances: { user: Person & { status: string } }[]; joinIntents: { user: Person & { status: string } }[] }): Person[] {
  const seen = new Map<string, Person>();
  for (const { user } of [...o.attendances, ...o.joinIntents]) {
    if (user.status === "ACTIVE" && !seen.has(user.id)) seen.set(user.id, { id: user.id, name: user.name, displayName: user.displayName, avatarUrl: user.avatarUrl });
  }
  return [...seen.values()];
}

export type SessionCard = {
  id: string;
  title: string;
  theme: string | null;
  mode: MeetingMode;
  startsAt: Date;
  endsAt: Date;
  state: "live" | "soon" | "upcoming";
  joined: Person[];
  interested: Person[];
  iAmInterested: boolean;
};

/**
 * Sessions to surface at the top of the feed: those running now, then those starting within the
 * hour, then the next few upcoming. Only sessions the viewer is allowed to see are considered.
 */
export async function getSessionHighlights(ctx: OrgContext, take = 4): Promise<SessionCard[]> {
  const facts = await accessFacts(ctx);
  const now = new Date();
  const rows = await db.meetingOccurrence.findMany({
    where: { AND: [visibleOccurrenceWhere(ctx, facts), { endsAt: { gte: now }, status: { in: ["SCHEDULED", "LIVE"] }, meeting: { status: "ACTIVE" }, startsAt: { lte: new Date(now.getTime() + 7 * 86400_000) } }] },
    include: {
      meeting: { select: { title: true, theme: true, mode: true } },
      attendances: { select: { user: { select: personSelect } }, take: 50 },
      joinIntents: { select: { user: { select: personSelect } }, orderBy: { createdAt: "desc" }, take: 100 },
      interests: { select: { user: { select: personSelect } }, orderBy: { createdAt: "desc" }, take: 50 },
    },
    orderBy: { startsAt: "asc" },
    take,
  });
  return rows.map((o) => {
    const live = o.status === "LIVE" || o.startsAt <= now;
    const soon = !live && o.startsAt.getTime() - now.getTime() <= SOON_MINUTES * 60_000;
    const interested = o.interests.map((i) => i.user).filter((u) => u.status === "ACTIVE");
    return {
      id: o.id,
      title: o.meeting.title,
      theme: o.meeting.theme,
      mode: o.meeting.mode,
      startsAt: o.startsAt,
      endsAt: o.endsAt,
      state: live ? "live" : soon ? "soon" : "upcoming",
      joined: live ? participants(o) : [],
      interested,
      iAmInterested: interested.some((u) => u.id === ctx.actor.id),
    } satisfies SessionCard;
  });
}

/** "I'm interested" in a session the viewer can see; calling again removes it. */
export async function toggleSessionInterest(ctx: OrgContext, occurrenceId: string) {
  requireActiveOrg(ctx);
  const facts = await accessFacts(ctx);
  const occ = await db.meetingOccurrence.findFirst({ where: { AND: [visibleOccurrenceWhere(ctx, facts), { id: occurrenceId, endsAt: { gte: new Date() }, status: { not: "CANCELLED" } }] } });
  if (!occ) throw new NotFoundError("Session not found.");
  const existing = await db.sessionInterest.findUnique({ where: { occurrenceId_userId: { occurrenceId: occ.id, userId: ctx.actor.id } } });
  if (existing) {
    await db.sessionInterest.delete({ where: { id: existing.id } });
    return false;
  }
  await rateLimit(`interest:${ctx.actor.id}`, 120, 3600);
  await db.sessionInterest.create({ data: { organizationId: ctx.org.id, occurrenceId: occ.id, userId: ctx.actor.id } });
  return true;
}

// ---------------------------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------------------------

export const FEED_FILTERS = ["all", "prayer", "testimonies", "sessions", "announcements"] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number];
const PAGE = 15;

type Author = { id: string; name: string; displayName: string | null; avatarUrl: string | null };
export type FeedItem =
  | {
      kind: "prayer";
      id: string;
      at: Date;
      title: string;
      body: string;
      author: Author;
      anonymous: boolean;
      groupName: string | null;
      status: "OPEN" | "ANSWERED" | "CLOSED";
      prayed: number;
      iPrayed: boolean;
      comments: number;
    }
  | { kind: "testimony"; id: string; at: Date; title: string; body: string; imageUrl: string | null; author: Author; showName: boolean; reactions: ReactionSummary; comments: number }
  | { kind: "session"; id: string; at: Date; title: string; theme: string | null; mode: MeetingMode; startsAt: Date; joined: Person[] }
  | { kind: "announcement"; id: string; at: Date; title: string; body: string; pinned: boolean; groupName: string | null }
  | { kind: "prayerPoint"; id: string; at: Date; title: string; body: string; scriptureRefs: string[] };

const authorSelect = { id: true, name: true, displayName: true, avatarUrl: true } as const;
const HIDDEN_AUTHOR: Author = { id: "", name: "Anonymous", displayName: null, avatarUrl: null };
/** Anonymous posts carry no author details at all, except for the author themselves. */
const visibleAuthor = (author: Author, hidden: boolean, me: string) => (hidden && author.id !== me ? HIDDEN_AUTHOR : author);

/**
 * Newest-first mix of shared prayer requests, approved testimonies, prayer sessions that took
 * place, announcements and prayer points. Private prayer requests never appear in the feed, even
 * for coordinators who can open them, so nobody sees confidential requests over someone's shoulder.
 * With `authorId`, returns only that member's posts that carry their name (for profile pages).
 */
export async function getFeed(ctx: OrgContext, opts: { before?: Date; filter?: FeedFilter; prayerEnabled?: boolean; authorId?: string } = {}) {
  // No cutoff on the first page; older pages read strictly before the last item shown.
  const olderThan = opts.before ? { lt: opts.before } : undefined;
  const filter = opts.filter ?? "all";
  const byAuthor = opts.authorId;
  const want = (k: FeedFilter) => (filter === "all" || filter === k) && (!byAuthor || k === "prayer" || k === "testimonies");
  const me = ctx.actor.id;
  const now = new Date();

  const [prayers, testimonies, sessions, announcements, points] = await Promise.all([
    want("prayer") && opts.prayerEnabled !== false
      ? prayerViewer(ctx).then((viewer) =>
          db.prayerRequest.findMany({
            where: {
              AND: [
                visiblePrayerWhere(ctx, viewer),
                { visibility: { in: ["GROUP", "ORGANIZATION"] }, moderationStatus: "APPROVED", createdAt: olderThan },
                byAuthor ? { authorId: byAuthor, anonymous: false } : {},
              ],
            },
            include: {
              author: { select: authorSelect },
              group: { select: { name: true } },
              _count: { select: { acknowledgements: true, comments: true } },
              acknowledgements: { where: { userId: me }, select: { id: true } },
            },
            orderBy: { createdAt: "desc" },
            take: PAGE,
          }),
        )
      : [],
    want("testimonies")
      ? db.testimony.findMany({
          where: { organizationId: ctx.org.id, moderationStatus: "APPROVED", publishedAt: olderThan ?? { not: null }, ...(byAuthor ? { authorId: byAuthor, showName: true } : {}) },
          include: { author: { select: authorSelect }, _count: { select: { comments: true } } },
          orderBy: { publishedAt: "desc" },
          take: PAGE,
        })
      : [],
    want("sessions")
      ? accessFacts(ctx).then((facts) =>
          db.meetingOccurrence.findMany({
            where: {
              AND: [
                visibleOccurrenceWhere(ctx, facts),
                { endsAt: olderThan ? { lt: olderThan.lt < now ? olderThan.lt : now } : { lt: now }, status: { not: "CANCELLED" } },
                { OR: [{ attendances: { some: {} } }, { joinIntents: { some: {} } }] },
              ],
            },
            include: {
              meeting: { select: { title: true, theme: true, mode: true } },
              attendances: { select: { user: { select: personSelect } }, take: 50 },
              joinIntents: { select: { user: { select: personSelect } }, take: 100 },
            },
            orderBy: { endsAt: "desc" },
            take: PAGE,
          }),
        )
      : [],
    want("announcements")
      ? myGroupIds(ctx.org.id, me).then((groups) =>
          db.announcement.findMany({
            where: { organizationId: ctx.org.id, status: "PUBLISHED", publishedAt: olderThan ?? { not: null }, OR: [{ groupId: null }, { groupId: { in: groups } }] },
            include: { group: { select: { name: true } } },
            orderBy: { publishedAt: "desc" },
            take: PAGE,
          }),
        )
      : [],
    filter === "all" && !byAuthor
      ? db.prayerPoint.findMany({ where: { organizationId: ctx.org.id, status: "PUBLISHED", publishedAt: olderThan ?? { not: null } }, orderBy: { publishedAt: "desc" }, take: PAGE })
      : [],
  ]);

  const reactions = await reactionSummaries(testimonies.map((t) => t.id), me);
  const items: FeedItem[] = [
    ...prayers.map((p): FeedItem => ({
      kind: "prayer",
      id: p.id,
      at: p.createdAt,
      title: p.title,
      body: p.body,
      author: visibleAuthor(p.author, p.anonymous, me),
      anonymous: p.anonymous,
      groupName: p.visibility === "GROUP" ? (p.group?.name ?? null) : null,
      status: p.status,
      prayed: p._count.acknowledgements,
      iPrayed: p.acknowledgements.length > 0,
      comments: p._count.comments,
    })),
    ...testimonies.map((t): FeedItem => ({
      kind: "testimony",
      id: t.id,
      at: t.publishedAt ?? t.createdAt,
      title: t.title,
      body: t.body,
      imageUrl: t.imageUrl,
      author: visibleAuthor(t.author, !t.showName, me),
      showName: t.showName,
      reactions: reactions.get(t.id)!,
      comments: t._count.comments,
    })),
    ...sessions.map((o): FeedItem => ({ kind: "session", id: o.id, at: o.endsAt, title: o.meeting.title, theme: o.meeting.theme, mode: o.meeting.mode, startsAt: o.startsAt, joined: participants(o) })),
    ...announcements.map((a): FeedItem => ({ kind: "announcement", id: a.id, at: a.publishedAt ?? a.createdAt, title: a.title, body: a.body, pinned: a.pinned, groupName: a.group?.name ?? null })),
    ...points.map((p): FeedItem => ({ kind: "prayerPoint", id: p.id, at: p.publishedAt ?? p.createdAt, title: p.title, body: p.body, scriptureRefs: p.scriptureRefs })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const page = items.slice(0, PAGE);
  // Every source returned at most PAGE rows older than `before`, so anything newer than the last
  // item shown is complete; the next page starts strictly before it.
  const hasMore = items.length > PAGE || [prayers, testimonies, sessions, announcements, points].some((l) => l.length === PAGE);
  return { items: page, nextBefore: hasMore && page.length ? page[page.length - 1]!.at : null };
}

// ---------------------------------------------------------------------------------------------
// Member profiles
// ---------------------------------------------------------------------------------------------

const ROLE_LABELS: Partial<Record<string, string>> = {
  OWNER: "Leader",
  ADMIN: "Administrator",
  PRAYER_COORDINATOR: "Prayer coordinator",
  MODERATOR: "Moderator",
  HOST: "Host",
};

/**
 * A member's profile as another member of the same community sees it: name, photo, bio,
 * community roles, the groups the viewer shares with them, and their posts that carry their name
 * and that the viewer may read. Members of other communities, and former members, are not found.
 */
export async function getMemberProfile(ctx: OrgContext, userId: string, opts: { before?: Date; prayerEnabled?: boolean } = {}) {
  const membership = await db.membership.findFirst({
    where: { organizationId: ctx.org.id, userId, status: "ACTIVE", user: { status: "ACTIVE" } },
    include: { user: { select: { id: true, name: true, displayName: true, avatarUrl: true, bio: true } } },
  });
  if (!membership) throw new NotFoundError("Member not found.");
  const mine = await myGroupIds(ctx.org.id, ctx.actor.id);
  const [sharedGroups, posts, stats] = await Promise.all([
    db.groupMembership.findMany({ where: { userId, groupId: { in: mine }, group: { archivedAt: null } }, select: { role: true, group: { select: { id: true, name: true } } } }),
    getFeed(ctx, { authorId: userId, before: opts.before, prayerEnabled: opts.prayerEnabled }),
    Promise.all([
      db.prayerAcknowledgement.count({ where: { userId, request: { organizationId: ctx.org.id } } }),
      db.postComment.count({ where: { authorId: userId, organizationId: ctx.org.id } }),
    ]),
  ]);
  return {
    user: membership.user,
    isMe: userId === ctx.actor.id,
    memberSince: membership.joinedAt ?? membership.createdAt,
    roles: membership.roles.map((r) => ROLE_LABELS[r]).filter((r): r is string => !!r),
    sharedGroups: sharedGroups.map((g) => ({ ...g.group, leader: g.role === "LEADER" })),
    posts,
    stats: { prayers: stats[0], encouragements: stats[1] },
  };
}
