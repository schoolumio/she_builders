import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/current-user";
import { getOrgContext } from "@/server/tenancy/context";
import { exportDonationsCsv } from "@/server/payments/donations";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ctx = await getOrgContext(user, { slug });
    const csv = await exportDonationsCsv(ctx);
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}-donations-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return jsonError(e);
  }
}
