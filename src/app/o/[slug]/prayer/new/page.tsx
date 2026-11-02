import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/card";
import { ActionForm, CheckboxField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { PrayerVisibilityPicker } from "@/components/prayer-visibility";
import { pageOrgContext } from "@/server/page";
import { db } from "@/server/db";
import { getEntitlements } from "@/server/billing/entitlements";
import { VISIBILITY_EXPLANATION } from "@/server/prayer/access";
import { createPrayerRequestAction } from "../../actions";

export const metadata = { title: "New prayer request" };

export default async function NewPrayerRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug);
  if (!(await getEntitlements(ctx.org.id)).features.has("feature.prayer_requests")) notFound();
  const groups = await db.groupMembership.findMany({ where: { organizationId: ctx.org.id, userId: ctx.actor.id, group: { archivedAt: null } }, include: { group: { select: { id: true, name: true } } } });
  return (
    <>
      <PageHeader title="Share a prayer request" description="Choose carefully who can see it. You can update it or delete it at any time." />
      <Card className="max-w-2xl">
        <ActionForm action={createPrayerRequestAction.bind(null, slug)}>
          <TextField label="Title" name="title" required maxLength={140} placeholder="e.g. Healing for my mother" />
          <TextAreaField label="Your request" name="body" required rows={6} maxLength={5000} />
          <PrayerVisibilityPicker groups={groups.map((g) => g.group)} explanations={VISIBILITY_EXPLANATION} moderated={ctx.org.moderateSharedPrayer} />
          {ctx.org.allowAnonymousPrayer && <CheckboxField name="anonymous" label="Share anonymously" hint="Your name is hidden from everyone else, including coordinators. You'll still be able to manage the request." />}
          <CheckboxField name="acknowledgeVisibility" label="I understand who will be able to see this request." />
          <SubmitButton pendingText="Sharing…">Share request</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
