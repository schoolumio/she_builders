"use client";

import { useState } from "react";
import { useFieldState } from "./ui/form";

type Vis = "PRIVATE" | "GROUP" | "ORGANIZATION";

/** Visibility picker that always shows, in plain words, who will see the request. */
export function PrayerVisibilityPicker({ groups, explanations, moderated }: { groups: { id: string; name: string }[]; explanations: Record<Vis, string>; moderated: boolean }) {
  const [vis, setVis] = useState<Vis>("PRIVATE");
  const groupErr = useFieldState("groupId").error;
  const options: { value: Vis; label: string; disabled?: boolean }[] = [
    { value: "PRIVATE", label: "Private — prayer coordinators only" },
    { value: "GROUP", label: "A group I belong to", disabled: groups.length === 0 },
    { value: "ORGANIZATION", label: "The whole community" },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Who can see this request?</legend>
      {options.map((o) => (
        <label key={o.value} className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${vis === o.value ? "border-violet-500 bg-violet-50" : "border-line"} ${o.disabled ? "opacity-50" : ""}`}>
          <input type="radio" name="visibility" value={o.value} checked={vis === o.value} disabled={o.disabled} onChange={() => setVis(o.value)} className="mt-0.5 size-4 accent-[var(--color-accent)]" />
          <span>{o.label}</span>
        </label>
      ))}
      {vis === "GROUP" && (
        <div>
          <label htmlFor="groupId" className="text-sm font-medium">Group</label>
          <select id="groupId" name="groupId" className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm" aria-invalid={groupErr ? true : undefined}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          {groupErr && <p className="text-xs text-danger">{groupErr}</p>}
        </div>
      )}
      <p className="rounded-lg bg-gold-100 px-3 py-2 text-sm text-plum-950" aria-live="polite">
        <strong>Who will see it:</strong> {explanations[vis]} {vis !== "PRIVATE" && moderated ? "A moderator reviews shared requests before they appear." : ""}
      </p>
    </fieldset>
  );
}
