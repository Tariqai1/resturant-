import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { logActivity } from "@/lib/platform/state";

export async function GET() {
  const cookieStore = await cookies();
  const impersonatingRaw = cookieStore.get("od_impersonate_resto")?.value;
  if (!impersonatingRaw) {
    return NextResponse.json({ ok: true, isImpersonating: false, impersonating: null });
  }

  try {
    const impersonating = JSON.parse(impersonatingRaw);
    return NextResponse.json({ ok: true, isImpersonating: true, impersonating });
  } catch {
    return NextResponse.json({ ok: true, isImpersonating: false, impersonating: null });
  }
}

export async function POST(request: Request) {
  const authCheck = await requireSuperAdmin();
  if (!authCheck.authorized || !authCheck.user) {
    return NextResponse.json(
      { ok: false, message: authCheck.reason || "Super Admin access required" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { restaurantId } = body;

    if (!restaurantId) {
      return NextResponse.json({ ok: false, message: "restaurantId is required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Fetch restaurant
    const { data: resto, error: restoErr } = await admin
      .from("restaurants")
      .select("id, name, owner_email")
      .eq("id", restaurantId)
      .single();

    if (restoErr || !resto) {
      return NextResponse.json(
        { ok: false, message: "Target restaurant not found" },
        { status: 404 }
      );
    }

    // 2. Fetch owner staff user for this restaurant
    const { data: ownerStaff } = await admin
      .from("staff_users")
      .select("id, name, role")
      .eq("restaurant_id", resto.id)
      .eq("role", "owner")
      .maybeSingle();

    const cookieStore = await cookies();

    // 3. Set Impersonation Cookie (Ghost Mode)
    cookieStore.set(
      "od_impersonate_resto",
      JSON.stringify({
        id: resto.id,
        name: resto.name,
        ownerEmail: resto.owner_email,
        startedAt: new Date().toISOString(),
        impersonatorEmail: authCheck.user.email,
      }),
      {
        path: "/",
        maxAge: 60 * 60 * 4,
        sameSite: "lax",
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
      }
    );

    // 4. Set Active Staff session scoped to this restaurant
    cookieStore.set(
      "od_active_staff",
      JSON.stringify({
        id: ownerStaff?.id || "ghost-owner-session",
        name: ownerStaff?.name || `${resto.name} (Ghost Owner)`,
        role: "owner",
        restaurant_id: resto.id,
        isImpersonating: true,
      }),
      {
        path: "/",
        maxAge: 60 * 60 * 4,
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      }
    );

    // 5. Log audit trail
    logActivity({
      action: "IMPERSONATE",
      actorEmail: authCheck.user.email || "super-admin",
      targetId: resto.id,
      targetName: resto.name,
      details: `Started Ghost Mode Impersonation of "${resto.name}" (${resto.owner_email})`,
    });

    return NextResponse.json({
      ok: true,
      message: `Now impersonating ${resto.name}`,
      restaurant: resto,
      redirect: "/",
    });
  } catch (error) {
    console.error("Super admin impersonation error:", error);
    return NextResponse.json({ ok: false, message: "Impersonation activation failed" }, { status: 500 });
  }
}

export async function DELETE() {
  const authCheck = await requireSuperAdmin();
  const cookieStore = await cookies();
  const existingRaw = cookieStore.get("od_impersonate_resto")?.value;
  let targetName = "restaurant";
  let targetId: string | undefined = undefined;

  if (existingRaw) {
    try {
      const parsed = JSON.parse(existingRaw);
      targetName = parsed.name || "restaurant";
      targetId = parsed.id;
    } catch {
      // ignore
    }
  }

  cookieStore.delete("od_impersonate_resto");
  cookieStore.delete("od_active_staff");

  if (authCheck.user?.email) {
    logActivity({
      action: "IMPERSONATE",
      actorEmail: authCheck.user.email,
      targetId,
      targetName,
      details: `Exited Ghost Mode Impersonation of "${targetName}"`,
    });
  }

  return NextResponse.json({
    ok: true,
    message: "Exited impersonation mode successfully",
    redirect: "/super-admin",
  });
}

