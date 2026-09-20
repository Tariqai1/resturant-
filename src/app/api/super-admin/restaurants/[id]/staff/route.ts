import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { getStaffPermissions, setStaffPermissions, logActivity } from "@/lib/platform/state";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireSuperAdmin();
  if (!authCheck.authorized) {
    return NextResponse.json({ ok: false, message: authCheck.reason || "Unauthorized" }, { status: 403 });
  }

  const { id: restaurantId } = await context.params;
  if (!restaurantId) {
    return NextResponse.json({ ok: false, message: "Missing restaurant ID" }, { status: 400 });
  }

  const admin = createAdminClient();

  const [restaurantRes, staffRes] = await Promise.all([
    admin.from("restaurants").select("id, name, owner_email").eq("id", restaurantId).maybeSingle(),
    admin
      .from("staff_users")
      .select("id, name, role, is_active, created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: true }),
  ]);

  if (!restaurantRes.data) {
    return NextResponse.json({ ok: false, message: "Restaurant not found" }, { status: 404 });
  }

  const staffWithPerms = (staffRes.data ?? []).map((s) => ({
    ...s,
    role: s.role === "staff" ? "waiter" : s.role === "admin" ? "owner" : s.role,
    permissions: getStaffPermissions(s.id, s.role),
  }));

  return NextResponse.json({
    ok: true,
    restaurant: restaurantRes.data,
    staff: staffWithPerms,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireSuperAdmin();
  if (!authCheck.authorized) {
    return NextResponse.json({ ok: false, message: authCheck.reason || "Unauthorized" }, { status: 403 });
  }

  const { id: restaurantId } = await context.params;
  if (!restaurantId) {
    return NextResponse.json({ ok: false, message: "Missing restaurant ID" }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const rawRole = String(body.role ?? "waiter").trim().toLowerCase();
    const pin = String(body.pin ?? "").trim();

    if (!name) {
      return NextResponse.json({ ok: false, message: "Staff member name is required" }, { status: 400 });
    }

    const validRoles = ["owner", "waiter", "kitchen", "staff", "admin", "manager", "captain", "cashier"];
    if (!validRoles.includes(rawRole)) {
      return NextResponse.json({ ok: false, message: "Invalid role specified" }, { status: 400 });
    }

    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json({ ok: false, message: "PIN must be exactly 4 digits (e.g. 1234)" }, { status: 400 });
    }

    // Canonical 3-role DB mapping
    let dbRole: "owner" | "kitchen" | "staff" = "staff";
    let displayRole: "owner" | "kitchen" | "waiter" = "waiter";

    if (rawRole === "owner" || rawRole === "admin" || rawRole === "manager") {
      dbRole = "owner";
      displayRole = "owner";
    } else if (rawRole === "kitchen") {
      dbRole = "kitchen";
      displayRole = "kitchen";
    } else {
      dbRole = "staff";
      displayRole = "waiter";
    }

    const admin = createAdminClient();

    const { data: restaurant } = await admin
      .from("restaurants")
      .select("id, name")
      .eq("id", restaurantId)
      .maybeSingle();

    if (!restaurant) {
      return NextResponse.json({ ok: false, message: "Restaurant not found" }, { status: 404 });
    }

    const pinHash = await bcrypt.hash(pin, 10);

    const { data: newMember, error } = await admin
      .from("staff_users")
      .insert({
        restaurant_id: restaurantId,
        name,
        role: dbRole,
        pin_hash: pinHash,
        is_active: true,
      })
      .select("id, name, role, is_active, created_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    const permissions = setStaffPermissions(
      newMember.id,
      {
        canEditOrders: body.canEditOrders !== undefined ? Boolean(body.canEditOrders) : undefined,
        canDeleteOrders: body.canDeleteOrders !== undefined ? Boolean(body.canDeleteOrders) : undefined,
        assignedPin: pin,
      },
      displayRole
    );

    logActivity({
      action: "ONBOARD",
      actorEmail: authCheck.user?.email || "super-admin",
      targetId: restaurantId,
      targetName: restaurant.name,
      details: `Created staff member "${name}" (${displayRole}) for restaurant "${restaurant.name}"`,
    });

    return NextResponse.json({ ok: true, staff: { ...newMember, role: displayRole, permissions } }, { status: 201 });
  } catch (error) {
    console.error("Super admin staff creation failed:", error);
    return NextResponse.json({ ok: false, message: "Failed to create staff member" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireSuperAdmin();
  if (!authCheck.authorized) {
    return NextResponse.json({ ok: false, message: authCheck.reason || "Unauthorized" }, { status: 403 });
  }

  const { id: restaurantId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { staffId, isActive, newPin, role, canEditOrders, canDeleteOrders } = body;

  if (!staffId) {
    return NextResponse.json({ ok: false, message: "staffId is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {};

  if (role) {
    const r = String(role).trim().toLowerCase();
    if (r === "owner" || r === "admin" || r === "manager") {
      updates.role = "owner";
    } else if (r === "kitchen") {
      updates.role = "kitchen";
    } else {
      updates.role = "staff";
    }
  }
  if (newPin) {
    const cleanPin = String(newPin).trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      return NextResponse.json({ ok: false, message: "PIN must be exactly 4 digits" }, { status: 400 });
    }
    updates.pin_hash = await bcrypt.hash(cleanPin, 10);
  }

  const { data: updated, error } = await admin
    .from("staff_users")
    .update(updates)
    .eq("id", staffId)
    .eq("restaurant_id", restaurantId)
    .select("id, name, role, is_active, created_at")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  if (canEditOrders !== undefined || canDeleteOrders !== undefined || newPin) {
    setStaffPermissions(
      staffId,
      {
        canEditOrders,
        canDeleteOrders,
        assignedPin: newPin ? String(newPin).trim() : undefined,
      },
      updated.role
    );
  }

  const permissions = getStaffPermissions(updated.id, updated.role);
  const displayRole = updated.role === "staff" ? "waiter" : updated.role === "admin" ? "owner" : updated.role;

  return NextResponse.json({ ok: true, staff: { ...updated, role: displayRole, permissions } });
}