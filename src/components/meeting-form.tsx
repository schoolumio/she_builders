"use client";

import { useState } from "react";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextAreaField, TextField, useFieldState } from "./ui/form";
import type { ActionState } from "@/server/action-types";

type Member = { id: string; name: string };
type Defaults = {
  meetingId?: string;
  title?: string;
  description?: string | null;
  theme?: string | null;
  scriptureRefs?: string[];
  mode?: "WHATSAPP" | "AUDIO" | "VIDEO";
  format?: "INTERACTIVE" | "BROADCAST";
  visibility?: "PUBLIC" | "MEMBERS" | "GROUP" | "INVITED";
  groupId?: string | null;
  externalUrl?: string | null;
  externalInstructions?: string | null;
  waitingRoom?: boolean;
  chatEnabled?: boolean;
  giftsEnabled?: boolean;
  timezone?: string;
  startDate?: string;
  startTime?: string;
  durationMinutes?: number;
  frequency?: "NONE" | "DAILY" | "WEEKLY";
  interval?: number;
  byWeekday?: number[];
  untilDate?: string | null;
  hostIds?: string[];
  coHostIds?: string[];
  inviteeIds?: string[];
  agenda?: string;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function WeekdayError() {
  const { error } = useFieldState("byWeekday");
  return error ? <p className="text-xs font-medium text-danger">{error}</p> : null;
}

export function MeetingForm({
  action,
  defaults = {},
  members,
  groups,
  timezones,
  features,
  canChooseHosts,
  submitLabel,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  defaults?: Defaults;
  members: Member[];
  groups: { id: string; name: string }[];
  timezones: string[];
  features: { audio: boolean; video: boolean; recurring: boolean };
  canChooseHosts: boolean;
  submitLabel: string;
}) {
  const [mode, setMode] = useState(defaults.mode ?? "WHATSAPP");
  const [frequency, setFrequency] = useState(defaults.frequency ?? "NONE");
  const [visibility, setVisibility] = useState(defaults.visibility ?? "MEMBERS");
  const inApp = mode !== "WHATSAPP";
  return (
    <ActionForm action={action}>
      {defaults.meetingId && <input type="hidden" name="meetingId" value={defaults.meetingId} />}
      <TextField label="Title" name="title" defaultValue={defaults.title} required maxLength={140} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Where will you meet?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {([
            ["WHATSAPP", "WhatsApp", "Share a WhatsApp link and instructions", true],
            ["AUDIO", "In-app audio", "Secure audio room in the platform", features.audio],
            ["VIDEO", "In-app video", "Video room with screen sharing", features.video],
          ] as const).map(([v, label, hint, enabled]) => (
            <label key={v} className={`rounded-lg border p-3 text-sm ${mode === v ? "border-violet-500 bg-violet-50" : "border-line"} ${enabled ? "" : "opacity-50"}`}>
              <span className="flex items-center gap-2 font-medium">
                <input type="radio" name="mode" value={v} checked={mode === v} disabled={!enabled} onChange={() => setMode(v)} className="size-4" /> {label}
              </span>
              <span className="mt-1 block text-xs text-muted">{enabled ? hint : "Not included in your plan"}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode === "WHATSAPP" ? (
        <div className="space-y-4 rounded-lg bg-canvas p-4">
          <TextField label="WhatsApp link" name="externalUrl" type="url" defaultValue={defaults.externalUrl ?? ""} placeholder="https://chat.whatsapp.com/…" hint="A group invite link (chat.whatsapp.com) opens the group, not a call. A call link (call.whatsapp.com) opens the call directly." />
          <TextAreaField label="Joining instructions" name="externalInstructions" rows={3} defaultValue={defaults.externalInstructions ?? ""} placeholder="e.g. Join the group, then tap the call icon at 9pm." />
        </div>
      ) : (
        <div className="space-y-3 rounded-lg bg-canvas p-4">
          <SelectField
            label="Room format"
            name="format"
            defaultValue={defaults.format ?? "INTERACTIVE"}
            options={[
              { value: "INTERACTIVE", label: "Interactive — everyone can unmute (hosts can restrict)" },
              { value: "BROADCAST", label: "Prayer line — hosts speak; others listen and raise hands" },
            ]}
            hint="Use the prayer-line format for large sessions."
          />
          <CheckboxField name="waitingRoom" label="Waiting room — hosts admit each participant" defaultChecked={defaults.waitingRoom ?? false} />
          <CheckboxField name="chatEnabled" label="Allow chat during the meeting" defaultChecked={defaults.chatEnabled ?? true} />
          <CheckboxField name="giftsEnabled" label="Allow virtual gifts" defaultChecked={defaults.giftsEnabled ?? true} />
          <p className="text-xs text-muted">Meetings are never recorded.</p>
        </div>
      )}
      {!inApp && <input type="hidden" name="format" value="INTERACTIVE" />}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Date" name="startDate" type="date" defaultValue={defaults.startDate} required />
        <TextField label="Start time" name="startTime" type="time" defaultValue={defaults.startTime ?? "21:00"} required />
        <TextField label="Duration (minutes)" name="durationMinutes" type="number" min={10} max={720} defaultValue={String(defaults.durationMinutes ?? 60)} required />
        <SelectField label="Time zone" name="timezone" defaultValue={defaults.timezone} options={timezones.map((t) => ({ value: t, label: t }))} hint="The meeting keeps this local time, even across daylight-saving changes." />
      </div>

      <SelectField
        label="Repeats"
        name="frequency"
        defaultValue={frequency}
        onChange={(e) => setFrequency(e.target.value as typeof frequency)}
        options={[
          { value: "NONE", label: "Does not repeat" },
          ...(features.recurring ? [{ value: "DAILY", label: "Daily" }, { value: "WEEKLY", label: "Weekly on selected days" }] : []),
        ]}
        hint={features.recurring ? undefined : "Recurring meetings are available on paid plans."}
      />
      {frequency !== "NONE" && (
        <div className="grid gap-4 rounded-lg bg-canvas p-4 sm:grid-cols-2">
          <TextField label={frequency === "DAILY" ? "Every how many days" : "Every how many weeks"} name="interval" type="number" min={1} max={12} defaultValue={String(defaults.interval ?? 1)} />
          <TextField label="Ends on (optional)" name="untilDate" type="date" defaultValue={defaults.untilDate ?? ""} />
          {frequency === "WEEKLY" && (
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-medium">On these days</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {DAYS.map((d, i) => (
                  <label key={d} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm">
                    <input type="checkbox" name="byWeekday" value={i + 1} defaultChecked={defaults.byWeekday?.includes(i + 1)} className="size-4" /> {d}
                  </label>
                ))}
              </div>
              <WeekdayError />
            </fieldset>
          )}
        </div>
      )}
      {frequency === "NONE" && <input type="hidden" name="interval" value="1" />}

      <SelectField
        label="Who can see and join"
        name="visibility"
        defaultValue={visibility}
        onChange={(e) => setVisibility(e.target.value as typeof visibility)}
        options={[
          { value: "MEMBERS", label: "All members" },
          { value: "GROUP", label: "Members of a group" },
          { value: "INVITED", label: "Only invited members" },
          { value: "PUBLIC", label: "Listed publicly (joining still requires membership)" },
        ]}
      />
      {visibility === "GROUP" && <SelectField label="Group" name="groupId" defaultValue={defaults.groupId ?? groups[0]?.id} options={groups.map((g) => ({ value: g.id, label: g.name }))} />}

      {(visibility === "INVITED" || canChooseHosts) && (
        <details className="rounded-lg border border-line p-4" open={visibility === "INVITED"}>
          <summary className="cursor-pointer text-sm font-medium">People {canChooseHosts ? "(hosts, co-hosts, invitees)" : "(invitees)"}</summary>
          <div className="mt-3 max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Member</th>{canChooseHosts && <><th className="px-2 font-medium">Host</th><th className="px-2 font-medium">Co-host</th></>}<th className="px-2 font-medium">Invite</th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="py-2">{m.name}</td>
                    {canChooseHosts && (
                      <>
                        <td className="px-2"><input type="checkbox" name="hostIds" value={m.id} defaultChecked={defaults.hostIds?.includes(m.id)} aria-label={`${m.name} as host`} className="size-4" /></td>
                        <td className="px-2"><input type="checkbox" name="coHostIds" value={m.id} defaultChecked={defaults.coHostIds?.includes(m.id)} aria-label={`${m.name} as co-host`} className="size-4" /></td>
                      </>
                    )}
                    <td className="px-2"><input type="checkbox" name="inviteeIds" value={m.id} defaultChecked={defaults.inviteeIds?.includes(m.id)} aria-label={`Invite ${m.name}`} className="size-4" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <TextField label="Prayer theme" name="theme" defaultValue={defaults.theme ?? ""} maxLength={200} />
      <TextAreaField label="Scripture references" name="scriptureRefs" rows={2} defaultValue={defaults.scriptureRefs?.join("\n")} hint="One per line, e.g. Psalm 91:1-2" />
      <TextAreaField label="Description" name="description" rows={3} defaultValue={defaults.description ?? ""} />
      <TextAreaField label="Prayer agenda" name="agenda" rows={5} defaultValue={defaults.agenda} hint="One item per line: Title | details | scripture | minutes. e.g. Thanksgiving | Thank God for the week | Psalm 100 | 10" />
      <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
