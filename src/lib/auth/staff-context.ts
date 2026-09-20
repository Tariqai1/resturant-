import { cookies } from "next/headers";
import { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdminUser } from "@/lib/auth/super-admin";
import { getStaffPermissions, StaffOrderPermissions } from "@/lib/platform/state";

export type ResolvedStaffContext = {
  user: User;
  staffId: string;
  name: string;
  role: string;
  restaurantId: string;
  restaurantName: string;
  isSuperAdmin: boolean;
  permissions: StaffOrderPermissions;
};

export async function resolveStaffContext(user: User): Promise<ResolvedStaffContext | null> {
  const admin = createAdminClient();
  const isSuper = await isSuperAdminUser(user);
  const cookieStore = await cookies();

  // Check impersonation for Super Admin
  if (isSuper) {
    const impersonateCookie = cookieStore.get("od_impersonate_resto")?.value;
    if (impersonateCookie) {
      try {
        const imp = JSON.parse(impersonateCookie);
        if (imp && imp.id) {
          const perms = getStaffPermissions("ghost-owner", "owner");
          return {
            user,
            staffId: "ghost-owner",
            name: `${imp.name} (Ghost Mode)`,
            role: "owner",
            restaurantId: imp.id,
            restaurantName: imp.name || "Order Desk",
            isSuperAdmin: true,
            permissions: perms,
          };
        }
      } catch {
        // ignore
      }
    }
  }

  // 1. Check od_active_staff cookie set during PIN login
  const activeStaffCookie = cookieStore.get("od_active_staff")?.value;
  let activeStaffFromCookie: {
    id?: string;
    name?: string;
    role?: string;
    restaurant_id?: string;
  } | null = null;

  if (activeStaffCookie) {
    try {
      activeStaffFromCookie = JSON.parse(activeStaffCookie);
    } catch {
      // ignore
    }
  }

  let staffRecord: {
    id: string;
    name: string;
    role: string;
    restaurant_id: string;
  } | null = null;

  // If cookie contains valid staff id and restaurant_id
  if (activeStaffFromCookie?.id && activeStaffFromCookie?.restaurant_id) {
    const { data } = await admin
      .from("staff_users")
      .select("id, name, role, restaurant_id")
      .eq("id", activeStaffFromCookie.id)
      .maybeSingle();

    if (data) {
      staffRecord = data;
    }
  }

  // 2. Fallback: Lookup staff by auth_user_id (e.g. direct Supabase login)
  if (!staffRecord) {
    const { data } = await admin
      .from("staff_users")
      .select("id, name, role, restaurant_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (data) {
      staffRecord = data;
    }
  }

  // 3. Fallback: Match restaurant by owner_email if current user is owner
  if (!staffRecord && user.email) {
    const { data: restaurant } = await admin
      .from("restaurants")
      .select("id, name")
      .eq("owner_email", user.email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (restaurant) {
      // Find or treat as owner of this restaurant
      const { data: ownerStaff } = await admin
        .from("staff_users")
        .select("id, name, role, restaurant_id")
        .eq("restaurant_id", restaurant.id)
        .eq("role", "owner")
        .maybeSingle();

      if (ownerStaff) {
        staffRecord = ownerStaff;
      } else {
        staffRecord = {
          id: user.id,
          name: user.email.split("@")[0],
          role: "owner",
          restaurant_id: restaurant.id,
        };
      }
    }
  }

  // 4. Fallback: If super admin or fallback needed, pick active restaurant
  if (!staffRecord && isSuper) {
    const { data: latestResto } = await admin
      .from("restaurants")
      .select("id, name")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestResto) {
      staffRecord = {
        id: user.id,
        name: "Super Admin",
        role: "owner",
        restaurant_id: latestResto.id,
      };
    }
  }

  if (!staffRecord) {
    return null;
  }

  // Fetch restaurant name
  const { data: resto } = await admin
    .from("restaurants")
    .select("name")
    .eq("id", staffRecord.restaurant_id)
    .maybeSingle();

  const permissions = getStaffPermissions(staffRecord.id, staffRecord.role);

  return {
    user,
    staffId: staffRecord.id,
    name: staffRecord.name,
    role: staffRecord.role,
    restaurantId: staffRecord.restaurant_id,
    restaurantName: resto?.name || "Order Desk",
    isSuperAdmin: isSuper,
    permissions,
  };
}
