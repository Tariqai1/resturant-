import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { getActivities } from "@/lib/platform/state";

export async function GET(request: Request) {
  const authCheck = await requireSuperAdmin();
  if (!authCheck.authorized) {
    return NextResponse.json(
      { ok: false, message: authCheck.reason || "Super Admin access required" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(200, Math.max(10, Number(searchParams.get("limit")) || 100));
  const actionFilter = searchParams.get("action");

  let activities = getActivities(limit);
  if (actionFilter && actionFilter !== "all") {
    activities = activities.filter((a) => a.action === actionFilter);
  }

  return NextResponse.json({
    ok: true,
    activities,
  });
}

