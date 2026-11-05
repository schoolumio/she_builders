import Link from "next/link";
import { DateTime } from "luxon";
import { BookOpen, CheckCircle2, Megaphone, MessageCircle, Pin, UsersRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { FeedItem } from "@/server/social/service";
import { now } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { prayForAction, reactAction } from "@/app/o/[slug]/actions";
import { ReactionButton } from "./reaction-button";
import { ReactionPicker } from "./reaction-picker";
import { AvatarStack } from "./avatar-stack";
import { MODE } from "./session-card";

export function timeAgo(at: Date) {
  return DateTime.fromJSDate(at).toRelative({ base: DateTime.fromJSDate(now()), style: "short" }) ?? "";
}

function Shell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <article className={cn("rounded-2xl border border-line/80 bg-surface shadow-[var(--shadow-card)]", className)}>{children}</article>;
}

/** Author line; the avatar and name link to the member's profile when the author is known. */
function Byline({ name, avatar, meta, badge, href }: { name: string; avatar: React.ReactNode; meta: React.ReactNode; badge?: React.ReactNode; href?: string }) {
  return (
    <header className="flex items-center gap-3">
      {href ? <Link href={href} tabIndex={-1} aria-hidden>{avatar}</Link> : avatar}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-[0.95rem] font-semibold leading-tight text-plum-900">
          {href ? <Link href={href} className="truncate hover:underline">{name}</Link> : <span className="truncate">{name}</span>}
          {badge}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">{meta}</p>
      </div>
    </header>
  );
}

const Dot = () => <span aria-hidden>·</span>;

function CommentsLink({ href, count }: { href: string; count: number }) {
  return (
    <Link href={`${href}#encouragements`} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-ink/70 transition hover:bg-violet-50 hover:text-plum-900">
      <MessageCircle className="size-[1.1rem]" aria-hidden />
      Encourage{count > 0 && <span className="font-medium tabular-nums">· {count}</span>}
    </Link>
  );
}

/** One post in the community feed. Anonymous authors arrive already stripped by the service. */
export function PostCard({ item, slug, meId }: { item: FeedItem; slug: string; meId: string }) {
  const profile = (id: string) => (id ? `/o/${slug}/members/${id}` : undefined);

  if (item.kind === "prayer") {
    const href = `/o/${slug}/prayer/${item.id}`;
    const own = item.author.displayName ?? item.author.name;
    const name = !item.author.id ? "Anonymous" : item.anonymous ? `${own} (Anonymous to others)` : own;
    return (
      <Shell>
        <div className="p-4 sm:p-5">
          <Byline
            name={name}
            href={item.anonymous ? undefined : profile(item.author.id)}
            avatar={item.author.id ? <Avatar name={own} src={item.author.avatarUrl} size={44} /> : <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-violet-50 text-plum-700/60"><UsersRound className="size-5" /></span>}
            badge={item.status === "ANSWERED" ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.7rem] font-semibold text-emerald-800"><CheckCircle2 className="size-3" aria-hidden /> Answered</span> : null}
            meta={<>asked for prayer <Dot /> {timeAgo(item.at)}{item.groupName && <><Dot /><span className="inline-flex items-center gap-1"><UsersRound className="size-3" aria-hidden />{item.groupName}</span></>}</>}
          />
          <Link href={href} className="group mt-3 block">
            <h3 className="font-semibold text-plum-900 group-hover:underline">{item.title}</h3>
            <p className="mt-1 line-clamp-4 whitespace-pre-line text-[0.95rem] leading-relaxed text-ink/85">{item.body}</p>
          </Link>
        </div>
        <footer className="flex items-center gap-1 border-t border-line/70 px-2 py-1.5 sm:px-3">
          <ReactionButton action={prayForAction.bind(null, slug)} id={item.id} kind="pray" active={item.iPrayed} count={item.prayed} />
          <CommentsLink href={href} count={item.comments} />
        </footer>
      </Shell>
    );
  }

  if (item.kind === "testimony") {
    const href = `/o/${slug}/testimonies/${item.id}`;
    const name = item.author.id ? (item.author.displayName ?? item.author.name) : "A member";
    return (
      <Shell className="overflow-hidden">
        <div className="bg-gradient-to-br from-gold-100/70 via-surface to-surface p-4 sm:p-5">
          <Byline
            name={name}
            href={item.showName ? profile(item.author.id) : undefined}
            avatar={<Avatar name={name} src={item.author.avatarUrl} size={44} />}
            badge={<span className="rounded-full bg-gold-100 px-2 py-0.5 text-[0.7rem] font-semibold text-gold-600">Testimony</span>}
            meta={<>shared what God has done <Dot /> {timeAgo(item.at)}</>}
          />
          <Link href={href} className="group mt-3 block">
            <h3 className="font-serif text-xl font-semibold text-plum-900 group-hover:underline">{item.title}</h3>
            <p className="mt-1 line-clamp-5 whitespace-pre-line text-[0.95rem] leading-relaxed text-ink/85">{item.body}</p>
          </Link>
        </div>
        {item.imageUrl && (
          <Link href={href} className="block bg-canvas">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imageUrl} alt="" loading="lazy" className="max-h-[32rem] w-full object-cover" />
          </Link>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-1 border-t border-line/70 px-2 py-1.5 sm:px-3">
          <ReactionPicker action={reactAction.bind(null, slug)} id={item.id} summary={item.reactions} />
          <CommentsLink href={href} count={item.comments} />
        </footer>
      </Shell>
    );
  }

  if (item.kind === "session") {
    const m = MODE[item.mode];
    return (
      <Shell className="p-4 sm:p-5">
        <Byline
          name={item.title}
          avatar={<span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-gradient-to-tr from-plum-900 to-plum-700 text-gold-400"><m.icon className="size-5" /></span>}
          badge={<span className="rounded-full bg-violet-50 px-2 py-0.5 text-[0.7rem] font-semibold text-plum-800">Prayer session</span>}
          meta={<>{m.label} <Dot /> {timeAgo(item.at)}</>}
        />
        {item.theme && <p className="mt-3 text-[0.95rem] text-ink/85">{item.theme}</p>}
        <div className="mt-3 rounded-xl bg-canvas px-4 py-3">
          <AvatarStack people={item.joined} total={item.joinedCount} verb={["prayed", "prayed together"]} meId={meId} />
        </div>
        <Link href={`/o/${slug}/meetings/${item.id}`} className="mt-3 inline-block text-sm font-semibold text-plum-700 hover:underline">See the session</Link>
      </Shell>
    );
  }

  if (item.kind === "announcement") {
    return (
      <Shell className="p-4 sm:p-5">
        <Byline
          name="Announcement"
          avatar={<span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-plum-900 text-gold-400"><Megaphone className="size-5" /></span>}
          badge={item.pinned ? <span className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-gold-600"><Pin className="size-3" aria-hidden /> Pinned</span> : null}
          meta={<>{timeAgo(item.at)}{item.groupName && <><Dot />{item.groupName}</>}</>}
        />
        <h3 className="mt-3 font-semibold text-plum-900">{item.title}</h3>
        <p className="mt-1 line-clamp-6 whitespace-pre-line text-[0.95rem] leading-relaxed text-ink/85">{item.body}</p>
      </Shell>
    );
  }

  return (
    <Shell className="relative overflow-hidden bg-plum-950 text-white">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(28rem_14rem_at_100%_0%,rgba(197,161,74,0.28),transparent_65%)]" />
      <div className="relative p-5 sm:p-6">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold-400"><BookOpen className="size-4" aria-hidden /> Prayer point <span className="font-normal normal-case tracking-normal text-white/50">· {timeAgo(item.at)}</span></p>
        <h3 className="mt-3 font-serif text-2xl leading-snug">{item.title}</h3>
        <p className="mt-2 line-clamp-6 whitespace-pre-line leading-relaxed text-white/80">{item.body}</p>
        {item.scriptureRefs.length > 0 && <p className="mt-3 text-sm italic text-gold-400">{item.scriptureRefs.join(" · ")}</p>}
      </div>
    </Shell>
  );
}
