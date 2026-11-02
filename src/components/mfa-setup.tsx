"use client";

import { useActionState } from "react";
import { buttonClass } from "./ui/button";
import type { ActionState } from "@/server/action-types";

type Action = (s: ActionState, fd: FormData) => Promise<ActionState>;

export function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div className="rounded-lg border border-gold-500 bg-gold-100 p-4" role="status">
      <p className="text-sm font-semibold text-plum-950">Save these recovery codes now</p>
      <p className="mt-1 text-xs text-plum-950">Each code works once if you lose your phone. They will not be shown again.</p>
      <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-sm">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
    </div>
  );
}

function Message({ state }: { state: ActionState }) {
  if (!state?.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}{state.fieldErrors?.code ? ` ${state.fieldErrors.code}` : ""}</p>;
}

/** Two-step enrolment: show QR + secret, then confirm with a code and show recovery codes once. */
export function MfaSetup({ begin, confirm }: { begin: Action; confirm: Action }) {
  const [started, beginAction, beginning] = useActionState(begin, null);
  const [confirmed, confirmAction, confirming] = useActionState(confirm, null);
  const codes = confirmed?.data?.codes as string[] | undefined;
  if (codes)
    return (
      <div className="space-y-3">
        <Message state={confirmed} />
        <RecoveryCodes codes={codes} />
        <a href="/app/security" className={buttonClass("secondary")}>I&apos;ve saved my codes</a>
      </div>
    );
  const data = started?.data as { secret: string; qrSvg: string } | undefined;
  if (!data) {
    return (
      <form action={beginAction} className="space-y-2">
        <Message state={started} />
        <button className={buttonClass()} disabled={beginning}>{beginning ? "Preparing…" : "Set up two-factor authentication"}</button>
      </form>
    );
  }
  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Open an authenticator app (for example Google Authenticator, Microsoft Authenticator or 1Password).</li>
        <li>Scan this QR code, or enter the key manually.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {/* The SVG is generated on our server by the qrcode library from our own otpauth URI. */}
      <div className="w-48 rounded-lg border border-line bg-white p-2" role="img" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: data.qrSvg }} />
      <p className="text-sm">Key: <code className="break-all rounded bg-canvas px-1.5 py-0.5 font-mono">{data.secret.match(/.{1,4}/g)?.join(" ")}</code></p>
      <form action={confirmAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div>
          <label htmlFor="mfa-code" className="block text-sm font-medium">Code from the app</label>
          <input id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} className="mt-1 block min-h-11 w-40 rounded-lg border border-line bg-white px-3 text-lg tracking-widest" />
        </div>
        <button className={buttonClass()} disabled={confirming}>{confirming ? "Checking…" : "Turn on"}</button>
      </form>
      <Message state={confirmed} />
    </div>
  );
}

export function CodesForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);
  const codes = state?.data?.codes as string[] | undefined;
  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div>
          <label htmlFor="regen-code" className="block text-sm font-medium">Current code</label>
          <input id="regen-code" name="code" autoComplete="one-time-code" required maxLength={12} className="mt-1 block min-h-11 w-40 rounded-lg border border-line bg-white px-3" />
        </div>
        <button className={buttonClass("secondary")} disabled={pending}>Create new recovery codes</button>
      </form>
      <Message state={state} />
      {codes && <RecoveryCodes codes={codes} />}
    </div>
  );
}
