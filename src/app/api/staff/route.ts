import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStaffContext } from "@/lib/auth/staff-context";
import { getStaffPermissions, setStaffPermissions, getRestaurantFeatures } from "@/lib/platform/state";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const staffContext = await resolveStaffContext(user);
  if (!staffContext) {
    return NextResponse.json({ message: "Staff authentication required" }, { status: 401 });
  }

  const isAuthorized =
    staffContext.isSuperAdmin || ["admin", "owner", "manager"].includes(staffContext.role);
  if (!isAuthorized) {
    return NextResponse.json({ message: "Manager or Owner access required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const targetRestaurantId =
    (staffContext.isSuperAdmin && url.searchParams.get("restaurantId")) ||
    staffContext.restaurantId;

  const admin = createAdminClient();
  const [restaurantRes, staffRes] = await Promise.all([
    admin
      .from("restaurants")
      .select("id, name")
      .eq("id", targetRestaurantId)
      .maybeSingle(),
    admin
      .from("staff_users")
      .select("id, name, role, is_active, created_at")
      .eq("restaurant_id", targetRestaurantId)
      .order("created_at", { ascending: true }),
  ]);

  if (staffRes.error) {
    console.error("Staff list query failed", staffRes.error);
    return NextResponse.json({ message: "Unable to load staff" }, { status: 500 });
  }

  const staffWithPerms = (staffRes.data ?? []).map((s) => {
    const perms = getStaffPermissions(s.id, s.role);
    return {
      ...s,
      role: s.role === "staff" ? "waiter" : s.role === "admin" ? "owner" : s.role,
      phone: perms.phone,
      permissions: perms,
    };
  });

  return NextResponse.json({
    ok: true,
    restaurantId: targetRestaurantId,
    restaurantName: restaurantRes.data?.name || staffContext.restaurantName || "Order Desk",
    staff: staffWithPerms,
    features: getRestaurantFeatures(targetRestaurantId),
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const staffContext = await resolveStaffContext(user);
  if (!staffContext) {
    return NextResponse.json({ message: "Staff authentication required" }, { status: 401 });
  }

  const isAuthorized =
    staffContext.isSuperAdmin || ["admin", "owner", "manager"].includes(staffContext.role);
  if (!isAuthorized) {
    return NextResponse.json({ message: "Manager or Owner access required" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const targetRestaurantId =
    (staffContext.isSuperAdmin && body.restaurantId) || staffContext.restaurantId;

  if (!targetRestaurantId) {
    return NextResponse.json({ message: "No restaurant identified" }, { status: 404 });
  }

  const name = String(body.name ?? "").trim();
  const rawRole = String(body.role ?? "waiter").trim().toLowerCase();
  const role = rawRole === "staff" ? "waiter" : rawRole;
  const pin = String(body.pin ?? "").trim();
  const phone = String(body.phone ?? "").trim();

  if (!name) {
    return NextResponse.json({ message: "Staff member name is required" }, { status: 400 });
  }

  const validRoles = ["owner", "waiter", "kitchen", "staff", "admin", "manager", "captain", "cashier"];
  if (!validRoles.includes(rawRole)) {
    return NextResponse.json({ message: "Invalid role. Choose owner, waiter, or kitchen" }, { status: 400 });
  }

  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ message: "PIN must be exactly 4 digits (e.g. 1234)" }, { status: 400 });
  }

  // Canonical 3-role mapping:
  // Postgres check constraint is (role in ('staff', 'kitchen', 'admin', 'owner'))
  let dbRole: "owner" | "kitchen" | "staff" = "staff";
  let displayRole: "owner" | "kitchen" | "waiter" = "waiter";

  if (rawRole === "owner" || rawRole === "admin" || rawRole === "manager") {
    dbRole = "owner";
    displayRole = "owner";
  } else if (rawRole === "kitchen") {
    dbRole = "kitchen";
    displayRole = "kitchen";
  } else {
    // "waiter", "staff", "captain", "cashier"
    dbRole = "staff";
    displayRole = "waiter";
  }

  const pinHash = await bcrypt.hash(pin, 10);
  const admin = createAdminClient();

  const { data: newMember, error } = await admin
    .from("staff_users")
    .insert({
      restaurant_id: targetRestaurantId,
      name,
      role: dbRole,
      pin_hash: pinHash,
      is_active: true,
    })
    .select("id, name, role, is_active, created_at")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  // Save granular order permissions and phone
  const permissions = setStaffPermissions(
    newMember.id,
    {
      canEditOrders: body.canEditOrders !== undefined ? Boolean(body.canEditOrders) : undefined,
      canDeleteOrders: body.canDeleteOrders !== undefined ? Boolean(body.canDeleteOrders) : undefined,
      assignedPin: pin,
      phone: phone || undefined,
    },
    displayRole
  );

  return NextResponse.json({
    ok: true,
    restaurantId: targetRestaurantId,
    staff: { ...newMember, role: displayRole, phone, permissions },
  }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const staffContext = await resolveStaffContext(user);
  if (!staffContext) {
    return NextResponse.json({ message: "Staff authentication required" }, { status: 401 });
  }

  const isAuthorized =
    staffContext.isSuperAdmin || ["admin", "owner", "manager"].includes(staffContext.role);
  if (!isAuthorized) {
    return NextResponse.json({ message: "Manager or Owner access required" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { staffId, isActive, newPin, role, canEditOrders, canDeleteOrders, phone } = body;

  if (!staffId) {
    return NextResponse.json({ message: "staffId is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {};
  if (isActive !== undefined) updates.is_active = Boolean(isActive);
  if (role) {
    const rawR = String(role).trim().toLowerCase();
    if (rawR === "owner" || rawR === "admin" || rawR === "manager") {
      updates.role = "owner";
    } else if (rawR === "kitchen") {
      updates.role = "kitchen";
    } else {
      updates.role = "staff";
    }
  }
  if (newPin) {
    if (!/^\d{4}$/.test(String(newPin).trim())) {
      return NextResponse.json({ message: "PIN must be exactly 4 digits" }, { status: 400 });
    }
    updates.pin_hash = await bcrypt.hash(String(newPin).trim(), 10);
  }

  let query = admin
    .from("staff_users")
    .update(updates)
    .eq("id", staffId);

  if (!staffContext.isSuperAdmin) {
    query = query.eq("restaurant_id", staffContext.restaurantId);
  }

  const { data: updated, error } = await query
    .select("id, name, role, is_active, created_at")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  // Update permissions and/or assignedPin / phone if provided
  if (canEditOrders !== undefined || canDeleteOrders !== undefined || newPin || phone !== undefined) {
    setStaffPermissions(
      staffId,
      {
        canEditOrders,
        canDeleteOrders,
        assignedPin: newPin ? String(newPin).trim() : undefined,
        phone: phone !== undefined ? String(phone).trim() : undefined,
      },
      updated.role
    );
  }

  const permissions = getStaffPermissions(updated.id, updated.role);
  const displayRole = updated.role === "staff" ? "waiter" : updated.role === "admin" ? "owner" : updated.role;

  return NextResponse.json({
    ok: true,
    staff: { ...updated, role: displayRole, phone: permissions.phone, permissions },
  });
}