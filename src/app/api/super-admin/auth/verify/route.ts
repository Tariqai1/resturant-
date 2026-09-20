import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/super-admin";

export async function GET() {
  const authCheck = await requireSuperAdmin();

  if (!authCheck.authorized || !authCheck.user) {
    return NextResponse.json(
      {
        ok: false,
        authorized: false,
        message: authCheck.reason || "Platform Super Admin privileges required",
      },
      { status: 403 }
    );
  }

  return NextResponse.json({
    ok: true,
    authorized: true,
    email: authCheck.user.email,
  });
}
