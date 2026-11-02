import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { ActionForm, CheckboxField, SubmitButton } from "@/components/ui/form";
import { OrgProfileFields } from "@/components/org-profile-fields";
import { Avatar } from "@/components/ui/avatar";
import { pageOrgContext } from "@/server/page";
import { updateCommunitySettingsAction, updateProfileAction, uploadImageAction } from "../actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug, "org.settings");
  const org = ctx.org;
  return (
    <>
      <PageHeader title="Settings" description={<>Public page: <a className="underline" href={`/c/${slug}`}>/c/{slug}</a></>} />
      <div className="space-y-6">
        <Card>
          <CardTitle>Logo and cover image</CardTitle>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {(["logo", "cover"] as const).map((kind) => (
              <ActionForm key={kind} action={uploadImageAction.bind(null, slug)} encType="multipart/form-data">
                <input type="hidden" name="kind" value={kind} />
                <div className="flex items-center gap-3">
                  {kind === "logo" ? <Avatar name={org.name} src={org.logoUrl} size={56} /> : org.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={org.coverUrl} alt="" className="h-14 w-28 rounded object-cover" />
                  ) : <span className="h-14 w-28 rounded bg-violet-100" />}
                  <label className="text-sm font-medium" htmlFor={`file-${kind}`}>{kind === "logo" ? "Logo" : "Cover image"}</label>
                </div>
                <input id={`file-${kind}`} type="file" name="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm" />
                <p className="text-xs text-muted">PNG, JPEG or WebP, up to 2 MB.</p>
                <SubmitButton variant="secondary" size="sm">Upload</SubmitButton>
              </ActionForm>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle>Community profile</CardTitle>
          <ActionForm action={updateProfileAction.bind(null, slug)} className="mt-4">
            <OrgProfileFields org={org} />
            <SubmitButton>Save profile</SubmitButton>
          </ActionForm>
        </Card>
        <Card>
          <CardTitle>Prayer and testimony settings</CardTitle>
          <ActionForm action={updateCommunitySettingsAction.bind(null, slug)} className="mt-4">
            <CheckboxField name="allowAnonymousPrayer" label="Allow anonymous prayer requests" defaultChecked={org.allowAnonymousPrayer} />
            <CheckboxField name="moderateSharedPrayer" label="Review group and community prayer requests before they appear" defaultChecked={org.moderateSharedPrayer} hint="Private requests always go only to prayer coordinators." />
            <CheckboxField name="moderateTestimonies" label="Review members-only testimonies before they appear" defaultChecked={org.moderateTestimonies} hint="Public testimonies are always reviewed." />
            <SubmitButton>Save settings</SubmitButton>
          </ActionForm>
        </Card>
        <Card>
          <CardTitle>Verification</CardTitle>
          <p className="mt-2 text-sm text-muted">Status: <strong>{org.verification.toLowerCase()}</strong>. Organisation verification is reviewed by BridgeCodes on request and is separate from payment-account verification. Contact support to request a review.</p>
        </Card>
      </div>
    </>
  );
}
