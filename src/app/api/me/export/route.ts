import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/current-user";
import { exportUserData } from "@/server/privacy/service";
import { rateLimit } from "@/server/rate-limit";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await rateLimit(`export:${user.id}`, 5, 3600);
    const data = await exportUserData(user.id);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return jsonError(e);
  }
}
