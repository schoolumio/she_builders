import Link from "next/link";
import { Card, CardTitle, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { InlineAction } from "@/components/ui/inline-action";
import { pageOrgContext } from "@/server/page";
import { getCurrentUser } from "@/server/auth/current-user";
import { listTestimonies } from "@/server/content/service";
import { formatInZone } from "@/lib/time";
import { submitTestimonyAction, withdrawTestimonyAction } from "../actions";

export const metadata = { title: "Testimonies" };

export default async function TestimoniesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ from?: string }> }) {
  const { slug } = await params;
  const { from } = await searchParams;
  const ctx = await pageOrgContext(slug);
  const user = (await getCurrentUser())!;
  const rows = await listTestimonies(ctx);
  return (
    <>
      <PageHeader title="Testimonies" description="Stories of answered prayer, shared with consent." />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-3">
          {rows.length === 0 && <EmptyState title="No testimonies yet">Be the first to share how God has answered prayer.</EmptyState>}
          {rows.map((t) => (
            <Card key={t.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/o/${slug}/testimonies/${t.id}`} className="font-semibold text-plum-900 hover:underline">{t.title}</Link>
                {t.moderationStatus === "PENDING" && <Badge tone="warning">Awaiting review</Badge>}
                {t.audience === "PUBLIC" && <Badge tone="gold">Public</Badge>}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm">{t.body}</p>
              <p className="mt-2 text-xs text-muted">{t.showName ? t.author.name : "A member"} · {formatInZone(t.createdAt, user.timezone, "d LLL yyyy")}</p>
              {t.authorId === user.id && (
                <div className="mt-3">
                  <InlineAction action={withdrawTestimonyAction.bind(null, slug)} fields={{ id: t.id }} variant="ghost" confirm="Withdraw this testimony?">Withdraw</InlineAction>
                </div>
              )}
            </Card>
          ))}
        </div>
        <Card className="h-fit scroll-mt-24" id="share">
          <CardTitle>Share a testimony</CardTitle>
          <ActionForm action={submitTestimonyAction.bind(null, slug)} className="mt-3" resetOnSuccess>
            {from && <input type="hidden" name="prayerRequestId" value={from} />}
            <TextField label="Title" name="title" required maxLength={160} />
            <TextAreaField label="Your testimony" name="body" required rows={6} />
            <SelectField label="Who can read it" name="audience" options={[{ value: "MEMBERS", label: "Members of this community" }, { value: "PUBLIC", label: "Anyone (public page)" }]} />
            <CheckboxField name="showName" label="Show my name" defaultChecked />
            <CheckboxField name="consent" label="I consent to this testimony being shared with the audience I chose." />
            <CheckboxField name="publicConsent" label="If public: I understand anyone on the internet will be able to read it." />
            <SubmitButton>Submit</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
