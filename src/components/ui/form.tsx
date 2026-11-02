"use client";

import { createContext, useActionState, useContext, useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import { buttonClass } from "./button";
import type { ActionState } from "@/server/action-types";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

const FormStateContext = createContext<ActionState>(null);

/**
 * Progressive-enhancement form bound to a server action. Shows a summary message and wires
 * field-level errors to <Field> components by name.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  successMessage,
  ...rest
}: { action: Action; children: React.ReactNode; className?: string; resetOnSuccess?: boolean; successMessage?: string } & Omit<React.FormHTMLAttributes<HTMLFormElement>, "action">) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    if (state && msgRef.current) msgRef.current.focus();
  }, [state, resetOnSuccess]);
  const message = state?.message ?? (state?.ok ? successMessage : undefined);
  return (
    <FormStateContext.Provider value={state}>
      <form ref={ref} action={formAction} className={cn("space-y-4", className)} noValidate {...rest}>
        {message && (
          <div
            ref={msgRef}
            tabIndex={-1}
            role={state?.ok ? "status" : "alert"}
            className={cn("rounded-lg border px-4 py-3 text-sm outline-none", state?.ok ? "border-success/20 bg-success-bg text-success" : "border-danger/20 bg-danger-bg text-danger")}
          >
            {message}
          </div>
        )}
        {children}
      </form>
    </FormStateContext.Provider>
  );
}

export function useFieldState(name: string) {
  const state = useContext(FormStateContext);
  return { error: state?.fieldErrors?.[name], value: state?.values?.[name] };
}

type FieldProps = {
  label: string;
  name: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children?: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean; defaultValue?: string }) => React.ReactNode;
};

export function Field({ label, name, hint, required, className, children }: FieldProps) {
  const id = useId();
  const { error, value } = useFieldState(name);
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {children?.({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, defaultValue: value })}
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass =
  "block w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink shadow-sm placeholder:text-muted/70 focus:border-violet-500 aria-[invalid=true]:border-danger min-h-11 sm:min-h-10";

export function TextField({ label, name, hint, required, className, defaultValue, ...input }: Omit<FieldProps, "children"> & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} name={name} hint={hint} required={required} className={className}>
      {(p) => <input name={name} required={required} className={inputClass} {...input} {...p} defaultValue={p.defaultValue ?? (defaultValue as string | undefined)} />}
    </Field>
  );
}

export function TextAreaField({ label, name, hint, required, className, defaultValue, rows = 4, ...input }: Omit<FieldProps, "children"> & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} name={name} hint={hint} required={required} className={className}>
      {(p) => <textarea name={name} required={required} rows={rows} className={inputClass} {...input} {...p} defaultValue={p.defaultValue ?? (defaultValue as string | undefined)} />}
    </Field>
  );
}

export function SelectField({
  label,
  name,
  hint,
  required,
  className,
  defaultValue,
  options,
  ...input
}: Omit<FieldProps, "children"> & React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <Field label={label} name={name} hint={hint} required={required} className={className}>
      {(p) => (
        <select name={name} required={required} className={inputClass} {...input} {...p} defaultValue={p.defaultValue ?? (defaultValue as string | undefined)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function CheckboxField({ label, name, hint, defaultChecked, value = "on", className }: { label: React.ReactNode; name: string; hint?: React.ReactNode; defaultChecked?: boolean; value?: string; className?: string }) {
  const id = useId();
  const { error } = useFieldState(name);
  return (
    <div className={cn("flex gap-3", className)}>
      <input id={id} type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="mt-0.5 size-5 shrink-0 rounded border-line accent-[var(--color-accent)]" aria-describedby={hint || error ? `${id}-d` : undefined} aria-invalid={error ? true : undefined} />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {(hint || error) && (
          <p id={`${id}-d`} className={cn("text-xs", error ? "font-medium text-danger" : "text-muted")}>
            {error ?? hint}
          </p>
        )}
      </div>
    </div>
  );
}

export function SubmitButton({ children, pendingText, variant = "primary", size = "md", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string; variant?: "primary" | "secondary" | "danger" | "ghost" | "gold"; size?: "sm" | "md" | "lg" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || props.disabled} aria-disabled={pending} className={buttonClass(variant, size, className)} {...props}>
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}
