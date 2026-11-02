import { Card, PageHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { CampaignFields } from "@/components/campaign-fields";
import { pageOrgContext } from "@/server/page";
import { createCampaignAction } from "../../actions";

export const metadata = { title: "New campaign" };

export default async function NewCampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug, "campaigns.draft");
  return (
    <>
      <PageHeader title="New campaign" description="Saved as a draft. Submit it for approval when ready." />
      <Card className="max-w-3xl">
        <ActionForm action={createCampaignAction.bind(null, slug)}>
          <CampaignFields defaultCurrency={ctx.org.defaultCurrency} />
          <SubmitButton>Save draft</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
