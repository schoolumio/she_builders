"use client";

import { useActionState, useOptimistic, useTransition } from "react";
import { Check, Star } from "lucide-react";
import type { ActionState } from "@/server/action";
import { cn } from "@/lib/utils";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

/** "I'm interested" in an upcoming prayer session; tapping again undoes it. */
export function InterestButton({ action, id, active, onDark = false }: { action: Action; id: string; active: boolean; onDark?: boolean }) {
  const [state, formAction] = useActionState(action, null);
  const [, startTransition] = useTransition();
  const [on, setOn] = useOptimistic(active);
  return (
    <form
      action={(fd) =>
        startTransition(() => {
          setOn(!on);
          formAction(fd);
        })
      }
      className="inline-flex flex-col items-start"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-pressed={on}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition",
          on
            ? onDark ? "bg-white/15 text-white ring-1 ring-white/30" : "bg-gold-100 text-gold-600 ring-1 ring-gold-400/60"
            : onDark ? "bg-white text-plum-950 hover:bg-white/90" : "border border-line bg-surface text-plum-900 hover:bg-violet-50",
        )}
      >
        {on ? <Check className="size-4" aria-hidden /> : <Star className="size-4" aria-hidden />}
        {on ? "Interested" : "I'm interested"}
      </button>
      {state && !state.ok && state.message && <span role="alert" className="text-xs text-danger">{state.message}</span>}
    </form>
  );
}
