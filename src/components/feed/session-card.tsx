import Link from "next/link";
import { DateTime } from "luxon";
import { ArrowRight, MessageCircle, Mic, Video, type LucideIcon } from "lucide-react";
import type { MeetingMode } from "@prisma/client";
import type { SessionCard as Session } from "@/server/social/service";
import { sessionInterestAction } from "@/app/o/[slug]/actions";
import { now } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { AvatarStack } from "./avatar-stack";
import { InterestButton } from "./interest-button";

export const MODE: Record<MeetingMode, { label: string; icon: LucideIcon }> = {
  WHATSAPP: { label: "WhatsApp call", icon: MessageCircle },
  AUDIO: { label: "Audio room", icon: Mic },
  VIDEO: { label: "Video room", icon: Video },
};

/** A prayer session at the top of the feed: live now (join), starting soon, or coming up (interested). */
export function SessionCard({ s, slug, tz, meId }: { s: Session; slug: string; tz: string; meId: string }) {
  const href = `/o/${slug}/meetings/${s.id}`;
  const m = MODE[s.mode];
  const start = DateTime.fromJSDate(s.startsAt).setZone(tz);
  const base = DateTime.fromJSDate(now());
  const live = s.state === "live";

  return (
    <article className={cn("relative overflow-hidden rounded-2xl shadow-[var(--shadow-lift)]", live ? "bg-plum-950 text-white" : "border border-line/80 bg-surface")}>
      {live && <div aria-hidden className="absolute inset-0 bg-[radial-gradient(30rem_16rem_at_100%_0%,rgba(225,29,72,0.28),transparent_60%),radial-gradient(26rem_14rem_at_0%_100%,rgba(197,161,74,0.25),transparent_60%)]" />}
      <div className="relative p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          {live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-1 uppercase tracking-wider text-white">
              <span className="size-1.5 animate-pulse rounded-full bg-white" /> Live now
            </span>
          ) : (
            <span className={cn("rounded-full px-2.5 py-1 uppercase tracking-wider", s.state === "soon" ? "bg-gold-100 text-gold-600" : "bg-violet-50 text-plum-800")}>
              {s.state === "soon" ? `Starts ${start.toRelative({ base })}` : start.toFormat("ccc d LLL · HH:mm")}
            </span>
          )}
          <span className={cn("inline-flex items-center gap-1", live ? "text-white/70" : "text-muted")}>
            <m.icon className="size-3.5" aria-hidden /> {m.label}
          </span>
        </div>

        <Link href={href} className="group mt-3 block">
          <h3 className={cn("font-serif text-2xl leading-snug group-hover:underline", live ? "text-white" : "text-plum-900")}>{s.title}</h3>
          {s.theme && <p className={cn("mt-1 text-sm", live ? "text-white/70" : "text-muted")}>{s.theme}</p>}
          {live && <p className="mt-1 text-sm text-white/60">Started {start.toRelative({ base })}</p>}
        </Link>

        <div className="mt-4 space-y-2">
          {live && (s.joined.length ? <AvatarStack people={s.joined} verb={["is praying", "are praying"]} onDark meId={meId} /> : <p className="text-sm text-white/70">Be the first to join.</p>)}
          {!live && s.interested.length > 0 && <AvatarStack people={s.interested} verb={["is interested", "are interested"]} meId={meId} />}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {live ? (
            <Link href={href} className="inline-flex items-center gap-2 rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-plum-950 transition hover:bg-gold-400">
              Join the prayer <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <>
              <InterestButton action={sessionInterestAction.bind(null, slug)} id={s.id} active={s.iAmInterested} />
              <Link href={href} className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold text-plum-700 hover:bg-violet-50">Details</Link>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
