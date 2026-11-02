import { Card, PageHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { pageOrgContext } from "@/server/page";
import { db } from "@/server/db";
import { todayInZone } from "@/lib/time";
import { ProgrammeFields } from "../form";
import { saveProgrammeAction } from "../../actions";

export const metadata = { title: "New programme" };

export default async function NewProgrammePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug, "programmes.manage");
  const groups = await db.communityGroup.findMany({ where: { organizationId: ctx.org.id, archivedAt: null } });
  return (
    <>
      <PageHeader title="New programme" description="Programmes start as drafts. Add daily activities, then publish." />
      <Card className="max-w-2xl">
        <ActionForm action={saveProgrammeAction.bind(null, slug)}>
          <ProgrammeFields groups={groups} today={todayInZone(ctx.org.timezone)} />
          <SubmitButton>Create draft</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
