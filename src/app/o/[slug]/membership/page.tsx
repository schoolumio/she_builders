import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { pageOrgContext } from "@/server/page";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/server/tenancy/permissions";
import { leaveOrganizationAction } from "../actions";

export const metadata = { title: "My membership" };

export default async function MembershipPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageOrgContext(slug);
  return (
    <>
      <PageHeader title="My membership" />
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardTitle>Your roles in {ctx.org.name}</CardTitle>
          <ul className="mt-3 space-y-3">
            {ctx.membership.roles.map((r) => (
              <li key={r}>
                <Badge tone="violet">{ROLE_LABELS[r]}</Badge>
                <p className="mt-1 text-sm text-muted">{ROLE_DESCRIPTIONS[r]}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>Leave this community</CardTitle>
          <p className="mt-1 text-sm text-muted">You&apos;ll lose access to its meetings and content. Your prayer requests stay visible according to the settings you chose unless you delete them first.</p>
          <ActionForm action={leaveOrganizationAction.bind(null, slug)} className="mt-3">
            <SubmitButton variant="danger">Leave {ctx.org.name}</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
