import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveStaffContext } from "@/lib/auth/staff-context";
import { getOrderPrepTime, setOrderPrepTime } from "@/lib/platform/state";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: "Staff authentication required" }, { status: 401 });
    }

    const staffContext = await resolveStaffContext(user);
    if (!staffContext) {
      return NextResponse.json({ message: "Staff record not found" }, { status: 403 });
    }

    const admin = createAdminClient();

    // Get active kitchen tickets
    // Active means orders that are 'open', with their order_items
    const { data: orders, error } = await admin
      .from("orders")
      .select(`
        id,
        table_id,
        status,
        opened_at,
        table_session_id,
        restaurant_tables (
          table_number
        ),
        order_items (
          id,
          menu_item_id,
          customer_name,
          qty,
          notes,
          item_status,
          created_at,
          menu_items (
            name,
            is_veg
          )
        )
      `)
      .eq("restaurant_id", staffContext.restaurantId)
      .eq("status", "open")
      .order("opened_at", { ascending: true });

    if (error) {
      throw error;
    }

    // Query recent orders for Day-wise analytics & Today stats (last 7 days)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const { data: recentOrdersData } = await admin
      .from("orders")
      .select(`
        id,
        status,
        opened_at,
        restaurant_tables (table_number),
        order_items (id, qty, item_status, menu_items (name, is_veg))
      `)
      .eq("restaurant_id", staffContext.restaurantId)
      .gte("opened_at", sevenDaysAgo.toISOString())
      .order("opened_at", { ascending: false });

    const recentOrders = recentOrdersData || [];

    // Calculate Today stats
    const todayOrders = recentOrders.filter((o) => new Date(o.opened_at) >= todayStart);
    const todayTotal = todayOrders.length;
    const todayCompleted = todayOrders.filter((o) => o.status !== "open").length;
    const todayActive = (orders || []).length;
    let todayDishes = 0;
    todayOrders.forEach((o) => {
      type RawItem = { qty: number; item_status: string };
      const items = (o.order_items as unknown as RawItem[]) || [];
      items.forEach((it) => {
        if (it.item_status === "served") {
          todayDishes += it.qty || 1;
        }
      });
    });

    // Group by Day (last 7 days)
    const dayWiseMap: {
      [key: string]: {
        date: string;
        label: string;
        totalOrders: number;
        completedOrders: number;
        totalDishes: number;
      };
    } = {};

    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const isToday = i === 0;
      const isYesterday = i === 1;
      const label = isToday
        ? "Today"
        : isYesterday
        ? "Yesterday"
        : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      dayWiseMap[dateStr] = {
        date: dateStr,
        label,
        totalOrders: 0,
        completedOrders: 0,
        totalDishes: 0,
      };
    }

    recentOrders.forEach((o) => {
      const dStr = new Date(o.opened_at).toISOString().split("T")[0];
      if (dayWiseMap[dStr]) {
        dayWiseMap[dStr].totalOrders += 1;
        if (o.status !== "open") {
          dayWiseMap[dStr].completedOrders += 1;
        }
        type RawItem = { qty: number };
        const items = (o.order_items as unknown as RawItem[]) || [];
        items.forEach((it) => {
          dayWiseMap[dStr].totalDishes += it.qty || 1;
        });
      }
    });

    const dayWiseStats = Object.values(dayWiseMap);

    return NextResponse.json({
      ok: true,
      restaurantName: staffContext.restaurantName,
      orders: (orders || []).map((ord) => {
        const tableData = ord.restaurant_tables as unknown as { table_number: string } | null;
        let displayTable = tableData?.table_number || "T--";
        if (ord.table_session_id?.startsWith("joined:")) {
          const extra = ord.table_session_id
            .replace("joined:", "")
            .split(",")
            .map((s: string) => s.trim())
            .filter((n: string) => n !== displayTable);
          if (extra.length > 0) {
            displayTable = `${displayTable} (+${extra.join("+")})`;
          }
        }
        return {
          ...ord,
          restaurant_tables: { table_number: displayTable },
          prepEstimate: getOrderPrepTime(ord.id),
        };
      }),
      todayStats: {
        totalOrders: todayTotal,
        activeOrders: todayActive,
        completedOrders: todayCompleted,
        dishesCooked: todayDishes,
      },
      dayWiseStats,
    });
  } catch (error) {
    console.error("Kitchen fetch error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: "Staff authentication required" }, { status: 401 });
    }

    const staffContext = await resolveStaffContext(user);
    if (!staffContext) {
      return NextResponse.json({ message: "Staff record not found" }, { status: 403 });
    }

    const admin = createAdminClient();

    const body = await request.json();
    const { itemId, nextStatus, orderId, markAllStatus, prepMinutes, setBy } = body as {
      itemId?: string;
      nextStatus?: "pending" | "preparing" | "served";
      orderId?: string;
      markAllStatus?: "preparing" | "served";
      prepMinutes?: number;
      setBy?: "chef" | "waiter" | "admin";
    };

    if (orderId && prepMinutes !== undefined) {
      const estimate = setOrderPrepTime(orderId, prepMinutes, setBy || "chef");
      return NextResponse.json({ ok: true, orderId, prepEstimate: estimate });
    }

    if (itemId && nextStatus) {
      const { data: curItem } = await admin
        .from("order_items")
        .select("item_status, order_id")
        .eq("id", itemId)
        .maybeSingle();

      if (!curItem) {
        return NextResponse.json({ message: "Item not found" }, { status: 404 });
      }

      if (curItem.item_status === nextStatus) {
        return NextResponse.json({ ok: true, itemId, item_status: nextStatus });
      }

      // If already served, cannot transition backwards
      if (curItem.item_status === "served") {
        return NextResponse.json({ ok: true, itemId, item_status: "served" });
      }

      // If transitioning from pending directly to served, go through preparing first
      if (curItem.item_status === "pending" && nextStatus === "served") {
        await admin
          .from("order_items")
          .update({ item_status: "preparing" })
          .eq("id", itemId);
      }

      const { error } = await admin
        .from("order_items")
        .update({ item_status: nextStatus })
        .eq("id", itemId);

      if (error) throw error;
      return NextResponse.json({ ok: true, itemId, item_status: nextStatus });
    }

    if (orderId && markAllStatus) {
      if (markAllStatus === "served") {
        // Step 1: Advance any 'pending' items to 'preparing'
        await admin
          .from("order_items")
          .update({ item_status: "preparing" })
          .eq("order_id", orderId)
          .eq("item_status", "pending");

        // Step 2: Advance all 'preparing' items to 'served'
        const { error } = await admin
          .from("order_items")
          .update({ item_status: "served" })
          .eq("order_id", orderId)
          .eq("item_status", "preparing");

        if (error) throw error;
      } else if (markAllStatus === "preparing") {
        // Only advance 'pending' items to 'preparing'
        const { error } = await admin
          .from("order_items")
          .update({ item_status: "preparing" })
          .eq("order_id", orderId)
          .eq("item_status", "pending");

        if (error) throw error;
      }

      // Keep restaurant_tables.status in sync
      const { data: orderRec } = await admin
        .from("orders")
        .select("table_id")
        .eq("id", orderId)
        .maybeSingle();

      if (orderRec?.table_id) {
        await admin
          .from("restaurant_tables")
          .update({ status: markAllStatus })
          .eq("id", orderRec.table_id);
      }

      return NextResponse.json({ ok: true, orderId, item_status: markAllStatus });
    }

    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  } catch (error) {
    console.error("Kitchen update error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Update failed" },
      { status: 500 }
    );
  }
}
