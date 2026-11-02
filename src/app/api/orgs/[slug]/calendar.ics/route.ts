import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/current-user";
import { getOrgContext } from "@/server/tenancy/context";
import { getOccurrenceForMember, listUpcomingOccurrences } from "@/server/meetings/service";
import { buildIcs } from "@/server/meetings/ics";
import { env } from "@/server/env";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ctx = await getOrgContext(user, { slug });
    const occurrenceId = new URL(req.url).searchParams.get("occurrence");
    const rows = occurrenceId
      ? [(await getOccurrenceForMember(ctx, occurrenceId)).occurrence]
      : await listUpcomingOccurrences(ctx, { days: 90, take: 300, includeCancelled: true });
    const ics = buildIcs(
      ctx.org.name,
      rows.map((o) => ({
        uid: `${o.id}@prayer-community-platform`,
        title: o.meeting.title,
        description: `${ctx.org.name}\n${env.appUrl}/o/${slug}/meetings/${o.id}`,
        url: `${env.appUrl}/o/${slug}/meetings/${o.id}`,
        startsAt: o.startsAt,
        endsAt: o.endsAt,
        cancelled: o.status === "CANCELLED",
      })),
    );
    return new NextResponse(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}.ics"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}
