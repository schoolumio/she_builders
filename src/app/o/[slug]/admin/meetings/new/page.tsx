import { Card, PageHeader } from "@/components/ui/card";
import { MeetingForm } from "@/components/meeting-form";
import { pageOrgContext } from "@/server/page";
import { can } from "@/server/tenancy/context";
import { todayInZone } from "@/lib/time";
import { meetingFormData } from "../data";
import { createMeetingAction } from "../../actions";

export const metadata = { title: "Schedule a meeting" };

export default async function NewMeetingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ group?: string }> }) {
  const { slug } = await params;
  const { group } = await searchParams;
  const ctx = await pageOrgContext(slug, "meetings.create");
  const data = await meetingFormData(ctx);
  const groupId = group && data.groups.some((g) => g.id === group) ? group : undefined;
  return (
    <>
      <PageHeader title="Schedule a meeting" />
      <Card className="max-w-3xl">
        <MeetingForm action={createMeetingAction.bind(null, slug)} {...data} canChooseHosts={can(ctx, "meetings.manage")} defaults={{ timezone: ctx.org.timezone, startDate: todayInZone(ctx.org.timezone), ...(groupId ? { visibility: "GROUP" as const, groupId } : {}) }} submitLabel="Create meeting" />
      </Card>
    </>
  );
}
