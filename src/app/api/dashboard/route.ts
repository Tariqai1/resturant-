import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdminUser } from "@/lib/auth/super-admin";
import { getBroadcast, getStaffPermissions, getActiveWaiterCalls, getRestaurantTheme, getRestaurantFeatures, getOrderPrepTime, getRestaurantUpsellConfig, getActivePendingApprovals } from "@/lib/platform/state";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, authenticated: false, message: "Staff authentication required" },
      { status: 401 }
    );
  }

  const isSuper = await isSuperAdminUser(user);
  const cookieStore = await cookies();
  const impersonateCookie = cookieStore.get("od_impersonate_resto")?.value;
  let impersonating: { id: string; name: string; ownerEmail: string } | null = null;

  if (impersonateCookie && isSuper) {
    try {
      impersonating = JSON.parse(impersonateCookie);
    } catch {
      // ignore
    }
  }

  const admin = createAdminClient();
  const broadcast = getBroadcast();

  // If impersonating a specific restaurant as Super Admin, scope queries to that restaurant ID
  if (impersonating) {
    const targetRestoId = impersonating.id;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      restaurantRes,
      staffRes,
      tablesRes,
      ordersRes,
      billsRes,
      bestsellersRes,
    ] = await Promise.all([
      admin.from("restaurants").select("id, name, subscription_plan, subscription_status").eq("id", targetRestoId).single(),
      admin.from("staff_users").select("id, name, role").eq("restaurant_id", targetRestoId).eq("role", "owner").maybeSingle(),
      admin.from("restaurant_tables").select("id, table_number, status, qr_token").eq("restaurant_id", targetRestoId).order("table_number"),
      admin.from("orders").select(`
        id,
        table_id,
        status,
        opened_at,
        table_session_id,
        restaurant_tables (id, table_number),
        order_items (
          id,
          qty,
          unit_price,
          notes,
          item_status,
          menu_items (id, name, is_veg, price)
        )
      `).eq("restaurant_id", targetRestoId).eq("status", "open").order("opened_at", { ascending: true }),
      admin.from("bills").select("id, total, payment_status, paid_at, order:orders(restaurant_id)").gte("paid_at", todayStart.toISOString()),
      admin.from("menu_items").select("id, name, price, is_veg, is_bestseller").eq("restaurant_id", targetRestoId).eq("is_available", true).order("is_bestseller", { ascending: false }).limit(6),
    ]);

    const targetBills = (billsRes.data || []).filter((b) => {
      const ord = b.order as unknown as { restaurant_id: string } | null;
      return ord?.restaurant_id === targetRestoId;
    });

    const tables = tablesRes.data || [];
    const openOrders = ordersRes.data || [];
    const paidBills = targetBills.filter((b) => b.payment_status === "paid");
    const todayRevenue = paidBills.reduce((sum, b) => sum + (Number(b.total) || 0), 0);
    const needsAttentionCount = tables.filter((t) => t.status === "pending" || t.status === "payment_pending").length;
    const dispatchedOrdersCount = paidBills.length + openOrders.length;
    const avgOrderValue = dispatchedOrdersCount > 0 ? Math.round(todayRevenue / dispatchedOrdersCount) : 0;

    const kitchenTickets = openOrders.map((ord, idx) => {
      type OrderItemJoin = {
        id: string;
        qty: number;
        notes: string | null;
        item_status: string;
        menu_items: { name: string; is_veg: boolean } | null;
      };
      const rawItems = (ord.order_items as unknown as OrderItemJoin[]) || [];
      const tableInfo = ord.restaurant_tables as unknown as { table_number: string } | null;

      return {
        id: ord.id,
        ticketNumber: `ORD-${(idx + 1).toString().padStart(4, "0")}`,
        tableNumber: tableInfo?.table_number || "T--",
        openedAt: ord.opened_at,
        status: (rawItems.some((i) => i.item_status === "preparing")
          ? "COOKING"
          : rawItems.every((i) => i.item_status === "served")
          ? "SERVED"
          : "NEW TICKET") as "NEW TICKET" | "COOKING" | "PREPARING" | "SERVED",
        items: rawItems.map((item) => ({
          id: item.id,
          name: item.menu_items?.name || "Dish",
          qty: item.qty,
          category: item.menu_items?.is_veg ? "VEG" : "NON-VEG",
          notes: item.notes || undefined,
        })),
      };
    });

    return NextResponse.json({
      ok: true,
      authenticated: true,
      isSuperAdmin: true,
      isImpersonating: true,
      impersonating,
      broadcast: broadcast?.active ? broadcast : null,
      restaurant: restaurantRes.data || { id: impersonating.id, name: impersonating.name },
      user: {
        id: staffRes.data?.id || "ghost-owner",
        name: staffRes.data?.name || `${impersonating.name} (Ghost Mode)`,
        role: "owner",
        isGhostMode: true,
      },
      tables,
      openOrders: openOrders.map((o) => ({ ...o, prepEstimate: getOrderPrepTime(o.id) })),
      metrics: {
        todayRevenue: Math.round(todayRevenue),
        dispatchedOrders: dispatchedOrdersCount,
        avgOrderValue,
        needsAttentionCount,
      },
      bestsellers: bestsellersRes.data || [],
      kitchenTickets,
      waiterCalls: getActiveWaiterCalls(targetRestoId),
      pendingApprovals: getActivePendingApprovals(targetRestoId),
      theme: getRestaurantTheme(targetRestoId),
      features: getRestaurantFeatures(targetRestoId),
      upsellConfig: getRestaurantUpsellConfig(targetRestoId),
    });
  }

  // Normal flow
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    restaurantResult,
    staffResult,
    tablesResult,
    ordersResult,
    billsResult,
    bestsellersResult,
  ] = await Promise.all([
    supabase
      .from("restaurants")
      .select("id, name, subscription_plan, subscription_status")
      .maybeSingle(),
    admin
      .from("staff_users")
      .select("id, name, role")
      .eq("auth_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("restaurant_tables")
      .select("id, table_number, status, qr_token")
      .order("table_number"),
    supabase
      .from("orders")
      .select(`
        id,
        table_id,
        status,
        opened_at,
        table_session_id,
        restaurant_tables (id, table_number),
        order_items (
          id,
          qty,
          unit_price,
          notes,
          item_status,
          menu_items (id, name, is_veg, price)
        )
      `)
      .eq("status", "open")
      .order("opened_at", { ascending: true }),
    supabase
      .from("bills")
      .select("id, total, payment_status, paid_at")
      .gte("paid_at", todayStart.toISOString()),
    supabase
      .from("menu_items")
      .select("id, name, price, is_veg, is_bestseller")
      .eq("is_available", true)
      .order("is_bestseller", { ascending: false })
      .limit(6),
  ]);

  const firstError =
    restaurantResult.error ?? tablesResult.error ?? ordersResult.error;
  if (firstError) {
    return NextResponse.json(
      { ok: false, authenticated: true, error: "Unable to load dashboard data" },
      { status: 500 }
    );
  }

  const activeStaffRaw = cookieStore.get("od_active_staff")?.value;
  let activeStaffProfile = null;
  if (activeStaffRaw) {
    try {
      activeStaffProfile = JSON.parse(activeStaffRaw);
    } catch {
      // ignore
    }
  }

  const rawProfile =
    activeStaffProfile ||
    staffResult.data || {
      name: user.email?.split("@")[0] || "Staff",
      role: "staff",
    };

  const userProfile = {
    ...rawProfile,
    permissions:
      rawProfile.permissions ||
      getStaffPermissions(rawProfile.id || user.id, rawProfile.role || "staff"),
  };

  // Compute live real-time metrics
  const bills = billsResult.data || [];
  const tables = tablesResult.data || [];
  const openOrders = ordersResult.data || [];

  const paidBills = bills.filter((b) => b.payment_status === "paid");
  const todayRevenue = paidBills.reduce((sum, b) => sum + (Number(b.total) || 0), 0);

  const needsAttentionCount = tables.filter(
    (t) => t.status === "pending" || t.status === "payment_pending"
  ).length;

  const dispatchedOrdersCount = paidBills.length + openOrders.length;
  const avgOrderValue = dispatchedOrdersCount > 0 ? Math.round(todayRevenue / dispatchedOrdersCount) : 0;

  // Format real kitchen tickets
  const kitchenTickets = openOrders.map((ord, idx) => {
    type OrderItemJoin = {
      id: string;
      qty: number;
      notes: string | null;
      item_status: string;
      menu_items: { name: string; is_veg: boolean } | null;
    };
    const rawItems = (ord.order_items as unknown as OrderItemJoin[]) || [];
    const tableInfo = ord.restaurant_tables as unknown as { table_number: string } | null;

    return {
      id: ord.id,
      ticketNumber: `ORD-${(idx + 1).toString().padStart(4, "0")}`,
      tableNumber: tableInfo?.table_number || "T--",
      openedAt: ord.opened_at,
      status: (rawItems.some((i) => i.item_status === "preparing")
        ? "COOKING"
        : rawItems.every((i) => i.item_status === "served")
        ? "SERVED"
        : "NEW TICKET") as "NEW TICKET" | "COOKING" | "PREPARING" | "SERVED",
      items: rawItems.map((item) => ({
        id: item.id,
        name: item.menu_items?.name || "Dish",
        qty: item.qty,
        category: item.menu_items?.is_veg ? "VEG" : "NON-VEG",
        notes: item.notes || undefined,
      })),
    };
  });

  return NextResponse.json({
    ok: true,
    authenticated: true,
    isSuperAdmin: isSuper,
    isImpersonating: false,
    impersonating: null,
    broadcast: broadcast?.active ? broadcast : null,
    restaurant: restaurantResult.data,
    user: userProfile,
    tables,
    openOrders,
    metrics: {
      todayRevenue: Math.round(todayRevenue),
      dispatchedOrders: dispatchedOrdersCount,
      avgOrderValue,
      needsAttentionCount,
    },
    bestsellers: bestsellersResult.data || [],
    kitchenTickets,
    waiterCalls: getActiveWaiterCalls(restaurantResult.data?.id),
    pendingApprovals: getActivePendingApprovals(restaurantResult.data?.id),
    theme: getRestaurantTheme(restaurantResult.data?.id),
    features: getRestaurantFeatures(restaurantResult.data?.id),
    upsellConfig: getRestaurantUpsellConfig(restaurantResult.data?.id),
  });
}
