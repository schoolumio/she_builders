"use client";

import { useActionState, useOptimistic, useTransition } from "react";
import type { ActionState } from "@/server/action";
import { cn } from "@/lib/utils";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;
type Type = "AMEN" | "PRAISE" | "LOVE";
type Summary = { counts: Record<Type, number>; total: number; mine: Type | null };

const OPTIONS: { type: Type; emoji: string; label: string }[] = [
  { type: "AMEN", emoji: "🙏", label: "Amen" },
  { type: "PRAISE", emoji: "🙌", label: "Praise God" },
  { type: "LOVE", emoji: "❤️", label: "Love" },
];

/** Amen / Praise / Love on a testimony. One reaction per person; tapping yours again removes it. */
export function ReactionPicker({ action, id, summary }: { action: Action; id: string; summary: Summary }) {
  const [state, formAction] = useActionState(action, null);
  const [, startTransition] = useTransition();
  const [s, setOptimistic] = useOptimistic(summary);

  function choose(type: Type) {
    startTransition(() => {
      setOptimistic((prev) => {
        const counts = { ...prev.counts };
        if (prev.mine) counts[prev.mine] -= 1;
        const mine = prev.mine === type ? null : type;
        if (mine) counts[mine] += 1;
        return { counts, mine, total: counts.AMEN + counts.PRAISE + counts.LOVE };
      });
      const fd = new FormData();
      fd.set("id", id);
      fd.set("type", type);
      formAction(fd);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="React to this testimony">
      {OPTIONS.map((o) => {
        const active = s.mine === o.type;
        return (
          <button
            key={o.type}
            type="button"
            onClick={() => choose(o.type)}
            aria-pressed={active}
            title={o.label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition",
              active ? "bg-gold-100 text-gold-600 ring-1 ring-gold-400/60" : "text-ink/70 hover:bg-violet-50 hover:text-plum-900",
            )}
          >
            <span aria-hidden className="text-base leading-none">{o.emoji}</span>
            <span className={cn(s.counts[o.type] === 0 && !active && "sr-only sm:not-sr-only")}>{o.label}</span>
            {s.counts[o.type] > 0 && <span className="tabular-nums font-medium">{s.counts[o.type]}</span>}
          </button>
        );
      })}
      {state && !state.ok && state.message && <span role="alert" className="px-2 text-xs text-danger">{state.message}</span>}
    </div>
  );
}
