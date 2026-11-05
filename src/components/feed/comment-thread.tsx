import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { InlineAction } from "@/components/ui/inline-action";
import type { listComments } from "@/server/social/service";
import { addCommentAction, deleteCommentAction } from "@/app/o/[slug]/actions";
import { CommentComposer } from "./comment-composer";
import { timeAgo } from "./post-card";

type Comment = Awaited<ReturnType<typeof listComments>>[number];

/** Encouragements under a prayer request or testimony, plus the box to add one. */
export function CommentThread({ slug, kind, id, comments, viewer }: { slug: string; kind: "prayer" | "testimony"; id: string; comments: Comment[]; viewer: { name: string; avatarUrl: string | null } }) {
  return (
    <section id="encouragements" aria-labelledby="encouragements-title" className="scroll-mt-24">
      <h2 id="encouragements-title" className="flex items-center gap-2 text-lg font-semibold text-plum-900">
        <MessageCircle className="size-5 text-plum-700" aria-hidden /> Encouragements{comments.length > 0 && <span className="text-muted">· {comments.length}</span>}
      </h2>
      {comments.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{kind === "prayer" ? "Be the first to share a word of encouragement or a scripture." : "Be the first to celebrate with them."}</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {comments.map((c) => {
            const name = c.author.displayName ?? c.author.name;
            return (
              <li key={c.id} className="flex gap-3">
                <Avatar name={name} src={c.author.avatarUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="rounded-2xl rounded-tl-sm bg-canvas px-4 py-2.5">
                    <Link href={`/o/${slug}/members/${c.author.id}`} className="text-sm font-semibold text-plum-900 hover:underline">{name}</Link>
                    <p className="mt-0.5 whitespace-pre-line text-[0.95rem] leading-relaxed text-ink/85">{c.body}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-3 px-2 text-xs text-muted">
                    <span>{timeAgo(c.createdAt)}</span>
                    {c.canDelete && (
                      <InlineAction action={deleteCommentAction.bind(null, slug)} fields={{ commentId: c.id }} variant="ghost" confirm="Remove this encouragement?">
                        Remove
                      </InlineAction>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-5 flex items-start gap-3">
        <Avatar name={viewer.name} src={viewer.avatarUrl} size={36} />
        <div className="flex-1">
          <CommentComposer action={addCommentAction.bind(null, slug)} kind={kind} id={id} placeholder={kind === "prayer" ? "Write an encouragement or a scripture…" : "Celebrate with them…"} />
        </div>
      </div>
    </section>
  );
}
