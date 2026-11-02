"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "./button";
import type { ActionState } from "@/server/action-types";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

function Btn({ children, variant, confirm }: { children: React.ReactNode; variant: "primary" | "secondary" | "ghost" | "danger" | "gold"; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass(variant, "sm")}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "…" : children}
    </button>
  );
}

/** A single-button form for row-level actions (approve, remove, cancel …) with inline error reporting. */
export function InlineAction({
  action,
  fields = {},
  children,
  variant = "secondary",
  confirm,
}: {
  action: Action;
  fields?: Record<string, string>;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold";
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Btn variant={variant} confirm={confirm}>
        {children}
      </Btn>
      {state && !state.ok && state.message && (
        <span role="alert" className="max-w-56 text-xs text-danger">
          {state.message}
        </span>
      )}
      {state?.ok && state.message && (
        <span role="status" className="text-xs text-success">
          {state.message}
        </span>
      )}
    </form>
  );
}
