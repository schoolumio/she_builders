import type { Programme } from "@prisma/client";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { PROGRAMME_TYPE_LABELS } from "@/server/programmes/service";

export function ProgrammeFields({ p, groups, today }: { p?: Programme; groups: { id: string; name: string }[]; today: string }) {
  return (
    <>
      <SelectField label="Type" name="type" defaultValue={p?.type ?? "BIBLE_STUDY"} options={Object.entries(PROGRAMME_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
      <TextField label="Title" name="title" defaultValue={p?.title} required />
      <TextAreaField label="Description" name="description" defaultValue={p?.description ?? ""} rows={3} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Start date" name="startDate" type="date" defaultValue={p?.startDate ?? today} required />
        <TextField label="Duration (days)" name="durationDays" type="number" min={1} max={366} defaultValue={String(p?.durationDays ?? 21)} required />
      </div>
      <SelectField label="Open to" name="groupId" defaultValue={p?.groupId ?? ""} options={[{ value: "", label: "All members" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} />
      <CheckboxField name="trackCompletion" label="Let members track completion" defaultChecked={p?.trackCompletion ?? true} />
    </>
  );
}
