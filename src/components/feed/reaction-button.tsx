"use client";

import { useActionState, useOptimistic, useTransition } from "react";
import { HandHeart, Sparkles } from "lucide-react";
import type { ActionState } from "@/server/action";
import { cn } from "@/lib/utils";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * "Pray" (one-way: once you've prayed it stays) and "Amen" (toggle) buttons with an instant,
 * optimistic count. The server action is the source of truth; the page revalidates after it.
 */
export function ReactionButton({ action, id, kind, active, count }: { action: Action; id: string; kind: "pray" | "amen"; active: boolean; count: number }) {
  const [state, formAction] = useActionState(action, null);
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic({ active, count });
  const Icon = kind === "pray" ? HandHeart : Sparkles;
  const locked = kind === "pray" && optimistic.active;
  const label = kind === "pray" ? (optimistic.active ? "Prayed" : "Pray") : "Amen";

  return (
    <form
      action={(fd) =>
        startTransition(() => {
          setOptimistic((s) => ({ active: !s.active, count: s.count + (s.active ? -1 : 1) }));
          formAction(fd);
        })
      }
      className="inline-flex flex-col items-start"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={locked}
        aria-pressed={optimistic.active}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition",
          optimistic.active ? "bg-gold-100 text-gold-600" : "text-ink/70 hover:bg-violet-50 hover:text-plum-900",
          locked && "cursor-default",
        )}
      >
        <Icon aria-hidden className={cn("size-[1.1rem]", optimistic.active && "fill-current")} />
        {label}
        {optimistic.count > 0 && <span className="tabular-nums font-medium">· {optimistic.count}</span>}
      </button>
      {state && !state.ok && state.message && <span role="alert" className="px-3 text-xs text-danger">{state.message}</span>}
    </form>
  );
}
