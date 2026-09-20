import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: "Staff authentication required" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: currentStaff } = await admin
      .from("staff_users")
      .select("restaurant_id, name")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const restaurantId = currentStaff?.restaurant_id;
    if (!restaurantId) {
      // Fallback to active restaurant
      const { data: resto } = await admin
        .from("restaurants")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!resto) {
        return NextResponse.json({ message: "Restaurant configuration not found" }, { status: 404 });
      }
    }

    const activeRestoId = restaurantId || (
      await admin
        .from("restaurants")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data?.id;

    const body = await request.json().catch(() => ({}));
    const { tableNumber, items, customerName = "Floor Dine-in" } = body;

    if (!tableNumber || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ message: "tableNumber and items array required" }, { status: 400 });
    }

    // Find table
    const { data: tableData, error: tableErr } = await admin
      .from("restaurant_tables")
      .select("id, status")
      .eq("restaurant_id", activeRestoId)
      .eq("table_number", tableNumber)
      .maybeSingle();

    if (tableErr || !tableData) {
      return NextResponse.json({ message: `Table ${tableNumber} not found` }, { status: 404 });
    }

    // Find or create open order
    let { data: openOrder } = await admin
      .from("orders")
      .select("id")
      .eq("table_id", tableData.id)
      .eq("status", "open")
      .maybeSingle();

    if (!openOrder) {
      const { data: createdOrder, error: orderErr } = await admin
        .from("orders")
        .insert({
          restaurant_id: activeRestoId,
          table_id: tableData.id,
          status: "open",
        })
        .select("id")
        .single();

      if (orderErr || !createdOrder) {
        return NextResponse.json({ message: orderErr?.message || "Failed to create order" }, { status: 500 });
      }
      openOrder = createdOrder;
    }

    // Lookup prices for items
    const itemIds = items.map((i: { itemId: string }) => i.itemId);
    const { data: menuList } = await admin
      .from("menu_items")
      .select("id, name, price")
      .in("id", itemIds);

    const priceMap = new Map((menuList || []).map((m) => [m.id, Number(m.price)]));

    // Insert order items
    const rowsToInsert = items.map((it: { itemId: string; qty: number; notes?: string }) => ({
      order_id: openOrder.id,
      menu_item_id: it.itemId,
      customer_name: customerName,
      qty: Math.max(1, Math.min(30, Number(it.qty) || 1)),
      unit_price: priceMap.get(it.itemId) || 0,
      notes: it.notes ? String(it.notes).slice(0, 200) : null,
      item_status: "pending",
    }));

    const { error: insertErr } = await admin.from("order_items").insert(rowsToInsert);
    if (insertErr) {
      return NextResponse.json({ message: insertErr.message }, { status: 500 });
    }

    // Update table status to 'pending'
    await admin
      .from("restaurant_tables")
      .update({ status: "pending" })
      .eq("id", tableData.id);

    return NextResponse.json({
      ok: true,
      message: `Dispatched ${rowsToInsert.length} item(s) to Kitchen for Table ${tableNumber}`,
      orderId: openOrder.id,
    });
  } catch (error) {
    console.error("Quick order error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Quick order failed" },
      { status: 500 }
    );
  }
}
