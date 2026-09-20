import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdminUser } from "@/lib/auth/super-admin";
import { getStaffPermissions, setStaffPermissions } from "@/lib/platform/state";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Staff authentication required" }, { status: 401 });
  }

  const isSuper = await isSuperAdminUser(user);
  const admin = createAdminClient();

  const { data: currentStaff } = await admin
    .from("staff_users")
    .select("restaurant_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let targetRestaurantId = currentStaff?.restaurant_id;

  if (!targetRestaurantId) {
    if (isSuper) {
      // Super admin viewing staff: pick active restaurant
      const { data: latestResto } = await admin
        .from("restaurants")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      targetRestaurantId = latestResto?.id;
    }
  }

  if (!targetRestaurantId) {
    return NextResponse.json({ message: "No restaurant identified" }, { status: 404 });
  }

  if (!isSuper && (!currentStaff || !["admin", "owner", "manager"].includes(currentStaff.role))) {
    return NextResponse.json({ message: "Manager or Owner access required" }, { status: 403 });
  }

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

  const staffWithPerms = (staffRes.data ?? []).map((s) => ({
    ...s,
    permissions: getStaffPermissions(s.id, s.role),
  }));

  return NextResponse.json({
    ok: true,
    restaurantName: restaurantRes.data?.name || "Order Desk",
    staff: staffWithPerms,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Staff authentication required" }, { status: 401 });
  }

  const isSuper = await isSuperAdminUser(user);
  const admin = createAdminClient();
  const { data: currentStaff } = await admin
    .from("staff_users")
    .select("restaurant_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let targetRestaurantId = currentStaff?.restaurant_id;
  if (!targetRestaurantId && isSuper) {
    const { data: latestResto } = await admin
      .from("restaurants")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    targetRestaurantId = latestResto?.id;
  }

  if (!targetRestaurantId) {
    return NextResponse.json({ message: "No restaurant identified" }, { status: 404 });
  }

  if (!isSuper && (!currentStaff || !["admin", "owner", "manager"].includes(currentStaff.role))) {
    return NextResponse.json({ message: "Manager or Owner access required" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const rawRole = String(body.role ?? "waiter").trim().toLowerCase();
  const role = rawRole === "staff" ? "waiter" : rawRole;
  const pin = String(body.pin ?? "").trim();

  if (!name) {
    return NextResponse.json({ message: "Staff member name is required" }, { status: 400 });
  }

  const validRoles = ["waiter", "captain", "kitchen", "cashier", "manager", "admin", "staff"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ message: "Invalid role. Choose waiter, captain, kitchen, cashier, or manager" }, { status: 400 });
  }

  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ message: "PIN must be exactly 4 digits (e.g. 1234)" }, { status: 400 });
  }

  const pinHash = await bcrypt.hash(pin, 10);

  const { data: newMember, error } = await admin
    .from("staff_users")
    .insert({
      restaurant_id: targetRestaurantId,
      name,
      role,
      pin_hash: pinHash,
      is_active: true,
    })
    .select("id, name, role, is_active, created_at")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  // Save granular order permissions
  const permissions = setStaffPermissions(
    newMember.id,
    {
      canEditOrders: body.canEditOrders !== undefined ? Boolean(body.canEditOrders) : undefined,
      canDeleteOrders: body.canDeleteOrders !== undefined ? Boolean(body.canDeleteOrders) : undefined,
      assignedPin: pin,
    },
    role
  );

  return NextResponse.json({ ok: true, staff: { ...newMember, permissions } }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Staff authentication required" }, { status: 401 });
  }

  const isSuper = await isSuperAdminUser(user);
  const admin = createAdminClient();
  const { data: currentStaff } = await admin
    .from("staff_users")
    .select("restaurant_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!isSuper && (!currentStaff || !["admin", "owner", "manager"].includes(currentStaff.role))) {
    return NextResponse.json({ message: "Manager or Owner access required" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { staffId, isActive, newPin, role, canEditOrders, canDeleteOrders } = body;

  if (!staffId) {
    return NextResponse.json({ message: "staffId is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (isActive !== undefined) updates.is_active = Boolean(isActive);
  if (role && ["waiter", "captain", "kitchen", "cashier", "manager", "admin", "staff"].includes(role)) {
    updates.role = role === "staff" ? "waiter" : role;
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

  if (!isSuper && currentStaff) {
    query = query.eq("restaurant_id", currentStaff.restaurant_id);
  }

  const { data: updated, error } = await query
    .select("id, name, role, is_active, created_at")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  // Update permissions and/or assignedPin if provided
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

  return NextResponse.json({ ok: true, staff: { ...updated, permissions } });
}