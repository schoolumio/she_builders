"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import type { ActionState } from "@/server/action";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

/** One-line "write an encouragement" box that grows as you type. */
export function CommentComposer({ action, kind, id, placeholder }: { action: Action; kind: "prayer" | "testimony"; id: string; placeholder: string }) {
  // Counting successful posts lets the textarea remount (and so clear) after each one.
  const [state, formAction, pending] = useActionState(async (prev: (ActionState & { posted?: number }) | null, fd: FormData) => {
    const res = await action(prev, fd);
    return { ...res, posted: (prev?.posted ?? 0) + (res?.ok ? 1 : 0) } as ActionState & { posted: number };
  }, null);
  return (
    <form action={formAction} className="space-y-1">
      <div className="flex items-end gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`comment-${id}`}>{placeholder}</label>
      <textarea
        key={state?.posted ?? 0}
        id={`comment-${id}`}
        name="body"
        required
        maxLength={1000}
        rows={1}
        placeholder={placeholder}
        className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-canvas px-4 py-2.5 text-sm outline-none transition focus:border-plum-700/40 focus:bg-white"
      />
      <button type="submit" disabled={pending} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-plum-900 text-white transition hover:bg-plum-800 disabled:opacity-60" aria-label="Post encouragement">
        <Send className="size-4" aria-hidden />
      </button>
      </div>
      {state && !state.ok && state.message && <p role="alert" className="px-4 text-xs text-danger">{state.message}</p>}
    </form>
  );
}
