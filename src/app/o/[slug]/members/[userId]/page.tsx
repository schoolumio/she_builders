import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { CalendarHeart, HandHeart, MessageCircle, Pencil, UsersRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { PostCard } from "@/components/feed/post-card";
import { pageOrgContext } from "@/server/page";
import { getEntitlements } from "@/server/billing/entitlements";
import { getMemberProfile } from "@/server/social/service";
import { NotFoundError } from "@/server/errors";

export const metadata = { title: "Member" };

export default async function MemberProfilePage({ params, searchParams }: { params: Promise<{ slug: string; userId: string }>; searchParams: Promise<{ before?: string }> }) {
  const { slug, userId } = await params;
  const sp = await searchParams;
  const beforeDate = sp.before ? new Date(sp.before) : undefined;
  const before = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : undefined;
  const ctx = await pageOrgContext(slug);
  const prayerEnabled = (await getEntitlements(ctx.org.id)).features.has("feature.prayer_requests");
  const p = await getMemberProfile(ctx, userId, { before, prayerEnabled }).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const name = p.user.displayName ?? p.user.name;
  const first = name.split(" ")[0];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-[var(--shadow-card)]">
        <div aria-hidden className="h-28 bg-plum-900 bg-[radial-gradient(24rem_10rem_at_100%_0%,rgba(197,161,74,0.45),transparent_65%),radial-gradient(20rem_10rem_at_0%_100%,rgba(74,95,174,0.55),transparent_60%)] sm:h-36" />
        <div className="px-5 pb-5 sm:px-6">
          <div className="-mt-12 flex items-end justify-between gap-3 sm:-mt-14">
            <span className="rounded-full bg-surface p-1 shadow-[var(--shadow-card)]">
              <Avatar name={name} src={p.user.avatarUrl} size={96} />
            </span>
            {p.isMe && (
              <Link href="/app/profile" className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-semibold text-plum-900 hover:bg-violet-50">
                <Pencil className="size-4" aria-hidden /> Edit profile
              </Link>
            )}
          </div>
          <h1 className="mt-3 font-serif text-3xl font-semibold text-plum-900">{name}</h1>
          {p.roles.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {p.roles.map((r) => <li key={r} className="rounded-full bg-gold-100 px-2.5 py-0.5 text-xs font-semibold text-gold-600">{r}</li>)}
            </ul>
          )}
          {p.user.bio ? (
            <p className="mt-3 whitespace-pre-line leading-relaxed text-ink/85">{p.user.bio}</p>
          ) : p.isMe ? (
            <p className="mt-3 text-sm text-muted">Add a short bio so others can get to know you. <Link href="/app/profile" className="font-medium text-plum-700 underline">Add one</Link></p>
          ) : null}
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            <li className="flex items-center gap-1.5"><CalendarHeart className="size-4" aria-hidden /> Member since {DateTime.fromJSDate(p.memberSince).toFormat("LLLL yyyy")}</li>
            <li className="flex items-center gap-1.5"><HandHeart className="size-4" aria-hidden /> <span className="font-semibold text-plum-900">{p.stats.prayers}</span> prayers prayed</li>
            <li className="flex items-center gap-1.5"><MessageCircle className="size-4" aria-hidden /> <span className="font-semibold text-plum-900">{p.stats.encouragements}</span> encouragements</li>
          </ul>
          {p.sharedGroups.length > 0 && !p.isMe && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/70 pt-4 text-sm">
              <span className="flex items-center gap-1.5 text-muted"><UsersRound className="size-4" aria-hidden /> Groups you share:</span>
              {p.sharedGroups.map((g) => (
                <Link key={g.id} href={`/o/${slug}/groups/${g.id}`} className="rounded-full bg-violet-50 px-3 py-1 font-medium text-plum-900 hover:bg-violet-100">
                  {g.name}{g.leader && <span className="ml-1 text-xs text-gold-600">· leads</span>}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <h2 className="px-1 pt-2 text-lg font-semibold text-plum-900">{p.isMe ? "Your posts" : `${first}'s posts`}</h2>
      {p.posts.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          {before ? "No older posts." : p.isMe ? "Prayer requests and testimonies you share with your name will appear here." : `${first} hasn't shared anything you can see yet.`}
        </p>
      ) : (
        <div className="space-y-4">{p.posts.items.map((item) => <PostCard key={`${item.kind}-${item.id}`} item={item} slug={slug} meId={ctx.actor.id} />)}</div>
      )}
      {p.posts.nextBefore && (
        <Link href={`/o/${slug}/members/${userId}?before=${p.posts.nextBefore.toISOString()}`} className="block rounded-2xl border border-line bg-surface py-3 text-center text-sm font-semibold text-plum-700 hover:bg-violet-50">Show older posts</Link>
      )}
    </div>
  );
}
