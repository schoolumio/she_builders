import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { Avatar } from "@/components/ui/avatar";
import { InlineAction } from "@/components/ui/inline-action";
import { requireUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { CATEGORY_LABELS } from "@/server/notifications";
import { commonTimezones } from "@/lib/time";
import { PushToggle } from "@/components/push-toggle";
import { vapidConfig } from "@/server/push";
import { changePasswordAction } from "../../(auth)/actions";
import { deleteAccountAction, profilePhotoAction, updatePreferencesAction, updateProfileAction } from "../actions";

export const metadata = { title: "Profile & settings" };

const CATEGORIES = ["MEETINGS", "ANNOUNCEMENTS", "PRAYER", "PROGRAMMES", "FUNDRAISING"] as const;

export default async function ProfilePage() {
  const user = await requireUser("/app/profile");
  const prefs = await db.notificationPreference.findMany({ where: { userId: user.id } });
  const pref = (c: string) => prefs.find((p) => p.category === c);
  const vapid = vapidConfig();
  return (
    <>
      <PageHeader title="Profile & settings" />
      <div className="space-y-6">
        <Card>
          <CardTitle>Profile</CardTitle>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Avatar name={user.displayName ?? user.name} src={user.avatarUrl} size={72} />
            <ActionForm action={profilePhotoAction} encType="multipart/form-data" className="flex flex-col gap-2 space-y-0">
              <label htmlFor="profile-photo" className="text-sm font-medium">Profile photo</label>
              <input id="profile-photo" type="file" name="photo" accept="image/png,image/jpeg,image/webp" className="block text-sm" />
              <SubmitButton variant="secondary" size="sm">Upload photo</SubmitButton>
            </ActionForm>
            {user.avatarUrl && <InlineAction action={profilePhotoAction} fields={{ op: "remove" }} variant="ghost">Remove photo</InlineAction>}
          </div>
          <ActionForm action={updateProfileAction} className="mt-6 max-w-lg">
            <TextField label="Full name" name="name" defaultValue={user.name} required />
            <TextField label="Display name" name="displayName" defaultValue={user.displayName ?? ""} hint="Optional. Shown in meetings instead of your full name." />
            <TextAreaField label="About you" name="bio" defaultValue={user.bio ?? ""} rows={3} maxLength={300} hint="Optional, up to 300 characters. Members of your communities can see it on your profile." />
            <SelectField label="Time zone" name="timezone" defaultValue={user.timezone} options={commonTimezones().map((t) => ({ value: t, label: t }))} hint="Meeting times are shown in this time zone." />
            <p className="text-sm text-muted">Email: {user.email}</p>
            <SubmitButton>Save profile</SubmitButton>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle>Notifications</CardTitle>
          <p className="mt-1 text-sm text-muted">Choose what you hear about. Account and security messages are always sent.</p>
          <ActionForm action={updatePreferencesAction} className="mt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-2 pr-4 font-medium">Category</th>
                    <th className="px-2 py-2 font-medium">In app</th>
                    <th className="px-2 py-2 font-medium">Email</th>
                    {vapid && <th className="px-2 py-2 font-medium">Browser</th>}
                  </tr>
                </thead>
                <tbody>
                  {CATEGORIES.map((c) => (
                    <tr key={c} className="border-t border-line">
                      <td className="py-3 pr-4">{CATEGORY_LABELS[c]}</td>
                      <td className="px-2 py-3">
                        <input type="checkbox" name={`${c}:inApp`} defaultChecked={pref(c)?.inApp ?? true} aria-label={`${CATEGORY_LABELS[c]} in app`} className="size-5 accent-[var(--color-accent)]" />
                      </td>
                      <td className="px-2 py-3">
                        <input type="checkbox" name={`${c}:email`} defaultChecked={pref(c)?.email ?? true} aria-label={`${CATEGORY_LABELS[c]} by email`} className="size-5 accent-[var(--color-accent)]" />
                      </td>
                      {vapid ? (
                        <td className="px-2 py-3">
                          <input type="checkbox" name={`${c}:push`} defaultChecked={pref(c)?.push ?? true} aria-label={`${CATEGORY_LABELS[c]} as browser notifications`} className="size-5 accent-[var(--color-accent)]" />
                        </td>
                      ) : (
                        <td hidden><input type="hidden" name={`${c}:push`} value={pref(c)?.push === false ? "" : "on"} /></td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SubmitButton>Save preferences</SubmitButton>
          </ActionForm>
          <div className="mt-6 border-t border-line pt-4">
            <p className="text-sm font-medium">Browser notifications on this device</p>
            {vapid ? (
              <div className="mt-2"><PushToggle publicKey={vapid.publicKey} /></div>
            ) : (
              <p className="mt-1 text-sm text-muted">Browser notifications are not configured on this platform yet.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Change password</CardTitle>
          <ActionForm action={changePasswordAction} className="mt-4 max-w-lg" resetOnSuccess>
            <TextField label="Current password" name="currentPassword" type="password" autoComplete="current-password" required />
            <TextField label="New password" name="newPassword" type="password" autoComplete="new-password" minLength={10} required />
            <SubmitButton>Change password</SubmitButton>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle>Your data</CardTitle>
          <p className="mt-1 text-sm text-muted">Download a copy of the information we hold about you (JSON).</p>
          <a href="/api/me/export" className="mt-3 inline-block text-sm font-semibold text-plum-700 underline">
            Download my data
          </a>
        </Card>

        <Card className="border-danger/30">
          <CardTitle className="text-danger">Delete account</CardTitle>
          <p className="mt-1 text-sm text-muted">
            This removes your profile, prayer requests and testimonies and signs you out everywhere. Donation records are kept in anonymised form where financial record-keeping requires it. If you own a community, transfer ownership first.
          </p>
          <ActionForm action={deleteAccountAction} className="mt-4 max-w-lg">
            <TextField label="Password" name="password" type="password" autoComplete="current-password" />
            <TextField label='Type "DELETE" to confirm' name="confirm" autoComplete="off" />
            <SubmitButton variant="danger">Delete my account</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
