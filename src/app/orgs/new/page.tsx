import Link from "next/link";
import { TopBar } from "@/components/top-bar";
import { Card, PageHeader } from "@/components/ui/card";
import { ActionForm, CheckboxField, SubmitButton, TextField } from "@/components/ui/form";
import { OrgProfileFields } from "@/components/org-profile-fields";
import { requireUser } from "@/server/auth/current-user";
import { createOrganizationAction } from "../../app/actions";

export const metadata = { title: "Start a community" };

export default async function NewOrgPage() {
  const user = await requireUser("/orgs/new");
  return (
    <>
      <TopBar user={user} />
      <main id="main" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader title="Start your community" description="You'll be the owner. You can change everything later, and you start on the Free plan." />
        <Card>
          <ActionForm action={createOrganizationAction}>
            <TextField label="Community web address" name="slug" required pattern="[a-z0-9-]{3,48}" hint="Lowercase letters, numbers and hyphens. Your public page will be /c/your-address." placeholder="grace-prayer-circle" />
            <OrgProfileFields />
            <CheckboxField
              name="acceptTerms"
              label={
                <>
                  I accept the{" "}
                  <Link href="/terms" className="underline">terms of service</Link>,{" "}
                  <Link href="/privacy" className="underline">privacy policy</Link> and{" "}
                  <Link href="/guidelines" className="underline">community guidelines</Link> on behalf of this community.
                </>
              }
            />
            <SubmitButton pendingText="Creating…">Create community</SubmitButton>
          </ActionForm>
        </Card>
      </main>
    </>
  );
}
