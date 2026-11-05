import "server-only";
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

/** "Amen" on a testimony; calling again removes it. Returns whether the viewer now says Amen. */
export async function toggleAmen(ctx: OrgContext, testimonyId: string) {
  requireActiveOrg(ctx);
  const t = await resolveTarget(ctx, { kind: "testimony", id: testimonyId });
  const existing = await db.testimonyReaction.findUnique({ where: { testimonyId_userId: { testimonyId: t.id, userId: ctx.actor.id } } });
  if (existing) {
    await db.testimonyReaction.delete({ where: { id: existing.id } });
    return false;
  }
  await rateLimit(`amen:${ctx.actor.id}`, 300, 3600);
  await db.testimonyReaction.create({ data: { testimonyId: t.id, userId: ctx.actor.id } });
  return true;
}

export async function getTestimony(ctx: OrgContext, id: string) {
  const t = await resolveTarget(ctx, { kind: "testimony", id });
  const testimony = await db.testimony.findUniqueOrThrow({
    where: { id: t.id },
    include: {
      author: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
      _count: { select: { reactions: true, comments: true } },
      reactions: { where: { userId: ctx.actor.id }, select: { id: true } },
    },
  });
  const isAuthor = testimony.authorId === ctx.actor.id;
  return { testimony: { ...testimony, author: visibleAuthor(testimony.author, !testimony.showName, ctx.actor.id) }, isAuthor };
}

// ---------------------------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------------------------

export const FEED_FILTERS = ["all", "prayer", "testimonies", "announcements"] as const;
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
  | { kind: "testimony"; id: string; at: Date; title: string; body: string; author: Author; showName: boolean; amens: number; iSaidAmen: boolean; comments: number }
  | { kind: "announcement"; id: string; at: Date; title: string; body: string; pinned: boolean; groupName: string | null }
  | { kind: "prayerPoint"; id: string; at: Date; title: string; body: string; scriptureRefs: string[] };

const authorSelect = { id: true, name: true, displayName: true, avatarUrl: true } as const;
const HIDDEN_AUTHOR: Author = { id: "", name: "Anonymous", displayName: null, avatarUrl: null };
/** Anonymous posts carry no author details at all, except for the author themselves. */
const visibleAuthor = (author: Author, hidden: boolean, me: string) => (hidden && author.id !== me ? HIDDEN_AUTHOR : author);

/**
 * Newest-first mix of shared prayer requests, approved testimonies, announcements and prayer
 * points. Private prayer requests never appear in the feed, even for coordinators who can open
 * them, so nobody sees confidential requests over someone's shoulder.
 */
export async function getFeed(ctx: OrgContext, opts: { before?: Date; filter?: FeedFilter; prayerEnabled?: boolean } = {}) {
  // No cutoff on the first page; older pages read strictly before the last item shown.
  const olderThan = opts.before ? { lt: opts.before } : undefined;
  const filter = opts.filter ?? "all";
  const want = (k: FeedFilter) => filter === "all" || filter === k;
  const me = ctx.actor.id;

  const [prayers, testimonies, announcements, points] = await Promise.all([
    want("prayer") && opts.prayerEnabled !== false
      ? prayerViewer(ctx).then((viewer) =>
          db.prayerRequest.findMany({
            where: { AND: [visiblePrayerWhere(ctx, viewer), { visibility: { in: ["GROUP", "ORGANIZATION"] }, moderationStatus: "APPROVED", createdAt: olderThan }] },
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
          where: { organizationId: ctx.org.id, moderationStatus: "APPROVED", publishedAt: olderThan ?? { not: null } },
          include: { author: { select: authorSelect }, _count: { select: { reactions: true, comments: true } }, reactions: { where: { userId: me }, select: { id: true } } },
          orderBy: { publishedAt: "desc" },
          take: PAGE,
        })
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
    filter === "all"
      ? db.prayerPoint.findMany({ where: { organizationId: ctx.org.id, status: "PUBLISHED", publishedAt: olderThan ?? { not: null } }, orderBy: { publishedAt: "desc" }, take: PAGE })
      : [],
  ]);

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
      author: visibleAuthor(t.author, !t.showName, me),
      showName: t.showName,
      amens: t._count.reactions,
      iSaidAmen: t.reactions.length > 0,
      comments: t._count.comments,
    })),
    ...announcements.map((a): FeedItem => ({ kind: "announcement", id: a.id, at: a.publishedAt ?? a.createdAt, title: a.title, body: a.body, pinned: a.pinned, groupName: a.group?.name ?? null })),
    ...points.map((p): FeedItem => ({ kind: "prayerPoint", id: p.id, at: p.publishedAt ?? p.createdAt, title: p.title, body: p.body, scriptureRefs: p.scriptureRefs })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const page = items.slice(0, PAGE);
  // Every source returned at most PAGE rows older than `before`, so anything newer than the last
  // item shown is complete; the next page starts strictly before it.
  const hasMore = items.length > PAGE || [prayers, testimonies, announcements, points].some((l) => l.length === PAGE);
  return { items: page, nextBefore: hasMore && page.length ? page[page.length - 1]!.at : null };
}
