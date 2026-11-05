import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, Notice } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { CommentThread } from "@/components/feed/comment-thread";
import { ReactionPicker } from "@/components/feed/reaction-picker";
import { timeAgo } from "@/components/feed/post-card";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { getTestimony, listComments } from "@/server/social/service";
import { NotFoundError } from "@/server/errors";
import { reactAction } from "../../actions";

export const metadata = { title: "Testimony" };

export default async function TestimonyPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await pageOrgContext(slug);
  const user = (await getCurrentUser())!;
  const data = await getTestimony(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { testimony: t, reactions } = data;
  const comments = await listComments(ctx, { kind: "testimony", id: t.id });
  const name = t.author.id ? (t.author.displayName ?? t.author.name) : "A member";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/o/${slug}/testimonies`} className="inline-flex items-center gap-1 text-sm font-medium text-plum-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All testimonies
      </Link>
      {t.moderationStatus !== "APPROVED" && <Notice tone="warning">This testimony is awaiting review. Only you and moderators can see it.</Notice>}
      <article className="overflow-hidden rounded-[var(--radius-card)] border border-line/80 bg-surface shadow-[var(--shadow-card)]">
        <div className="bg-gradient-to-br from-gold-100/70 via-surface to-surface p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Avatar name={name} src={t.author.avatarUrl} size={48} />
            <div>
              {t.author.id && t.showName ? <Link href={`/o/${slug}/members/${t.author.id}`} className="font-semibold text-plum-900 hover:underline">{name}</Link> : <p className="font-semibold text-plum-900">{name}</p>}
              <p className="text-xs text-muted">Testimony · {timeAgo(t.publishedAt ?? t.createdAt)}</p>
            </div>
          </div>
          <h1 className="mt-5 font-serif text-3xl font-semibold leading-tight text-plum-900">{t.title}</h1>
          <p className="mt-3 whitespace-pre-line text-[1.02rem] leading-relaxed text-ink/90">{t.body}</p>
        </div>
        {t.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.imageUrl} alt="" className="max-h-[40rem] w-full bg-canvas object-contain" />
        )}
        {t.moderationStatus === "APPROVED" && (
          <footer className="border-t border-line/70 px-3 py-2">
            <ReactionPicker action={reactAction.bind(null, slug)} id={t.id} summary={reactions} />
          </footer>
        )}
      </article>
      <Card>
        <CommentThread slug={slug} kind="testimony" id={t.id} comments={comments} viewer={{ name: user.displayName ?? user.name, avatarUrl: user.avatarUrl }} />
      </Card>
    </div>
  );
}
