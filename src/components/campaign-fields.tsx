import type { FundraisingCampaign } from "@prisma/client";
import { CheckboxField, SelectField, TextAreaField, TextField } from "./ui/form";
import { fromMinorUnits } from "@/lib/money";

export function CampaignFields({ c, defaultCurrency, currencyLocked }: { c?: FundraisingCampaign; defaultCurrency: string; currencyLocked?: boolean }) {
  const cur = c?.currency ?? defaultCurrency;
  const major = (v?: number | null) => (v == null ? "" : String(fromMinorUnits(v, cur)));
  const dt = (d?: Date | null) => (d ? d.toISOString().slice(0, 16) : "");
  return (
    <>
      <TextField label="Campaign title" name="title" defaultValue={c?.title} required />
      <TextAreaField label="Description" name="description" defaultValue={c?.description} rows={5} required hint="Explain clearly what the funds are for." />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Purpose" name="purpose" defaultValue={c?.purpose ?? "GENERAL"} options={[
          { value: "GENERAL", label: "General ministry support" },
          { value: "COMMUNITY_ACTIVITY", label: "Community activities" },
          { value: "CONFERENCE", label: "Conference or event" },
          { value: "OUTREACH", label: "Outreach" },
          { value: "WELFARE", label: "Approved welfare project" },
          { value: "EMERGENCY", label: "Emergency assistance" },
        ]} />
        <TextField label="Beneficiary (optional)" name="beneficiary" defaultValue={c?.beneficiary ?? ""} />
        <TextField label="Currency" name="currency" defaultValue={cur} maxLength={3} required readOnly={currencyLocked} hint={currencyLocked ? "Cannot change after publication." : undefined} />
        <TextField label="Target amount (optional)" name="targetAmount" type="number" step="0.01" defaultValue={major(c?.targetAmount)} />
        <TextField label="Suggested amounts" name="suggestedAmounts" defaultValue={c?.suggestedAmounts.map((a) => fromMinorUnits(a, cur)).join(", ") ?? "1000, 5000, 10000"} hint="Comma separated, in major units" />
        <TextField label="Minimum amount" name="minAmount" type="number" step="0.01" defaultValue={major(c?.minAmount) || "100"} />
        <TextField label="Maximum amount" name="maxAmount" type="number" step="0.01" defaultValue={c ? major(c.maxAmount) : ""} />
        <SelectField label="Visibility" name="visibility" defaultValue={c?.visibility ?? "PUBLIC"} options={[{ value: "PUBLIC", label: "Public page" }, { value: "MEMBERS", label: "Members only" }]} />
        <TextField label="Starts (optional)" name="startsAt" type="datetime-local" defaultValue={dt(c?.startsAt)} />
        <TextField label="Ends (optional)" name="endsAt" type="datetime-local" defaultValue={dt(c?.endsAt)} />
      </div>
      <CheckboxField name="allowCustomAmount" label="Allow donors to enter their own amount" defaultChecked={c?.allowCustomAmount ?? true} />
      <CheckboxField name="allowAnonymous" label="Allow anonymous donations" defaultChecked={c?.allowAnonymous ?? true} />
      <CheckboxField name="allowGuests" label="Allow donations without an account (public campaigns only)" defaultChecked={c?.allowGuests ?? true} />
      <TextAreaField label="Terms & disclosures shown to donors (optional)" name="terms" defaultValue={c?.terms ?? ""} rows={3} />
    </>
  );
}
