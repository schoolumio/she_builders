import type { Organization } from "@prisma/client";
import { SelectField, TextAreaField, TextField } from "./ui/form";
import { commonTimezones } from "@/lib/time";

export const COUNTRIES: { value: string; label: string }[] = [
  ["NG", "Nigeria"], ["GH", "Ghana"], ["KE", "Kenya"], ["ZA", "South Africa"], ["UG", "Uganda"], ["TZ", "Tanzania"], ["RW", "Rwanda"], ["CM", "Cameroon"], ["CI", "Côte d'Ivoire"], ["ZM", "Zambia"], ["ZW", "Zimbabwe"],
  ["GB", "United Kingdom"], ["IE", "Ireland"], ["US", "United States"], ["CA", "Canada"], ["AU", "Australia"], ["NZ", "New Zealand"], ["DE", "Germany"], ["FR", "France"], ["NL", "Netherlands"], ["IT", "Italy"], ["ES", "Spain"],
  ["BR", "Brazil"], ["IN", "India"], ["PH", "Philippines"], ["SG", "Singapore"], ["AE", "United Arab Emirates"], ["JM", "Jamaica"], ["TT", "Trinidad and Tobago"],
].map(([value, label]) => ({ value: value!, label: label! }));

const CURRENCIES = ["NGN", "GHS", "KES", "ZAR", "UGX", "USD", "GBP", "EUR", "CAD", "AUD"].map((c) => ({ value: c, label: c }));

export function OrgProfileFields({ org }: { org?: Partial<Organization> & { socialLinks?: unknown } }) {
  const social = (org?.socialLinks ?? {}) as Record<string, string>;
  return (
    <>
      <TextField label="Community name" name="name" defaultValue={org?.name} required maxLength={120} />
      <TextField label="Tagline" name="tagline" defaultValue={org?.tagline ?? ""} maxLength={160} hint="A short line shown on your public page." />
      <TextAreaField label="About" name="description" defaultValue={org?.description ?? ""} rows={4} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Country" name="country" defaultValue={org?.country ?? "NG"} options={COUNTRIES} required />
        <SelectField label="Primary time zone" name="timezone" defaultValue={org?.timezone ?? "Africa/Lagos"} options={commonTimezones().map((t) => ({ value: t, label: t }))} required />
        <SelectField label="Preferred language" name="language" defaultValue={org?.language ?? "en"} options={[{ value: "en", label: "English" }, { value: "fr", label: "French" }, { value: "pt", label: "Portuguese" }, { value: "es", label: "Spanish" }, { value: "sw", label: "Swahili" }, { value: "yo", label: "Yoruba" }, { value: "ig", label: "Igbo" }, { value: "ha", label: "Hausa" }]} />
        <SelectField label="Default currency" name="defaultCurrency" defaultValue={org?.defaultCurrency ?? "NGN"} options={CURRENCIES} />
        <TextField label="Contact email" name="contactEmail" type="email" defaultValue={org?.contactEmail ?? ""} />
        <TextField label="Contact phone" name="contactPhone" defaultValue={org?.contactPhone ?? ""} />
        <TextField label="Website" name="websiteUrl" type="url" placeholder="https://" defaultValue={org?.websiteUrl ?? ""} />
        <TextField label="Accent colour" name="accentColor" placeholder="#4e3170" defaultValue={org?.accentColor ?? ""} hint="Optional hex colour for your pages." />
        <TextField label="Facebook" name="facebookUrl" type="url" placeholder="https://" defaultValue={social.facebook ?? ""} />
        <TextField label="Instagram" name="instagramUrl" type="url" placeholder="https://" defaultValue={social.instagram ?? ""} />
        <TextField label="YouTube" name="youtubeUrl" type="url" placeholder="https://" defaultValue={social.youtube ?? ""} />
        <TextField label="X (Twitter)" name="xUrl" type="url" placeholder="https://" defaultValue={social.x ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Visibility"
          name="visibility"
          defaultValue={org?.visibility ?? "PUBLIC"}
          options={[
            { value: "PUBLIC", label: "Public — listed in the directory" },
            { value: "UNLISTED", label: "Unlisted — public page by link only" },
            { value: "PRIVATE", label: "Private — members only" },
          ]}
        />
        <SelectField
          label="How people join"
          name="joinPolicy"
          defaultValue={org?.joinPolicy ?? "APPROVAL"}
          options={[
            { value: "APPROVAL", label: "Request to join (admins approve)" },
            { value: "OPEN", label: "Open — anyone can join" },
            { value: "INVITE_ONLY", label: "Invitation only" },
          ]}
        />
      </div>
    </>
  );
}
