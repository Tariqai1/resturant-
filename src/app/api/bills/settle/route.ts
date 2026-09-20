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

    const body = await request.json().catch(() => ({}));
    const { tableNumber, tableId, orderId, paymentMode = "cash", extraTableNumbers } = body;

    const admin = createAdminClient();

    let targetOrderId = orderId;
    let targetTableId = tableId;
    let activeOrderSessionId: string | null = null;

    // If orderId not directly provided, locate open order by table
    if (!targetOrderId) {
      if (tableNumber) {
        const { data: tableData } = await admin
          .from("restaurant_tables")
          .select("id")
          .eq("table_number", tableNumber)
          .maybeSingle();

        if (tableData) {
          targetTableId = tableData.id;
        }
      }

      if (!targetTableId) {
        return NextResponse.json({ message: "Table ID or Table Number required" }, { status: 400 });
      }

      const { data: activeOrder } = await admin
        .from("orders")
        .select("id, table_id, table_session_id, restaurant_id")
        .eq("table_id", targetTableId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!activeOrder) {
        // Table has no open order, ensure it is set to empty
        await admin
          .from("restaurant_tables")
          .update({ status: "empty" })
          .eq("id", targetTableId);

        return NextResponse.json({
          ok: true,
          message: "No active order on table. Table status reset to available.",
        });
      }

      targetOrderId = activeOrder.id;
      targetTableId = activeOrder.table_id;
      activeOrderSessionId = activeOrder.table_session_id || null;
    }

    // Fetch order items with prices
    const { data: orderItems, error: itemsErr } = await admin
      .from("order_items")
      .select(`
        id,
        qty,
        unit_price,
        menu_items (price)
      `)
      .eq("order_id", targetOrderId);

    if (itemsErr) {
      return NextResponse.json({ message: "Failed to retrieve order items" }, { status: 500 });
    }

    type MenuItemJoin = { price: number } | null;
    const items = orderItems || [];
    const subtotal = items.reduce((sum, item) => {
      const menuData = item.menu_items as unknown as MenuItemJoin;
      const rate = Number(item.unit_price) || Number(menuData?.price) || 0;
      return sum + Number(item.qty) * rate;
    }, 0);

    const taxAmount = Math.round(subtotal * 0.05 * 100) / 100; // 5% GST
    const total = Math.round((subtotal + taxAmount) * 100) / 100;

    // 1. Insert Paid Bill
    const { data: billRecord, error: billErr } = await admin
      .from("bills")
      .insert({
        order_id: targetOrderId,
        subtotal,
        tax_amount: taxAmount,
        total,
        payment_mode: ["cash", "upi", "card"].includes(paymentMode) ? paymentMode : "cash",
        payment_status: "paid",
        paid_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (billErr) {
      return NextResponse.json({ message: billErr.message }, { status: 500 });
    }

    // 2. Mark Order as Closed
    await admin
      .from("orders")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
      })
      .eq("id", targetOrderId);

    // 3. Mark Table as Empty & auto-free any joined tables
    let allJoinedTables: string[] = [];
    if (activeOrderSessionId?.startsWith("joined:")) {
      allJoinedTables = activeOrderSessionId.replace("joined:", "").split(",").map((s: string) => s.trim());
    } else if (targetOrderId) {
      const { data: ord } = await admin
        .from("orders")
        .select("table_session_id")
        .eq("id", targetOrderId)
        .maybeSingle();
      if (ord?.table_session_id?.startsWith("joined:")) {
        allJoinedTables = ord.table_session_id.replace("joined:", "").split(",").map((s: string) => s.trim());
      }
    }

    if (targetTableId) {
      await admin
        .from("restaurant_tables")
        .update({ status: "empty" })
        .eq("id", targetTableId);
    }

    const tablesToFree = Array.from(new Set([
      ...(Array.isArray(extraTableNumbers) ? extraTableNumbers : []),
      ...allJoinedTables
    ])).filter(Boolean);

    if (tablesToFree.length > 0) {
      await admin
        .from("restaurant_tables")
        .update({ status: "empty" })
        .in("table_number", tablesToFree);
    }

    return NextResponse.json({
      ok: true,
      message: "Order successfully settled. Table is now available.",
      bill: billRecord,
    });
  } catch (error) {
    console.error("Settlement error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Settlement failed" },
      { status: 500 }
    );
  }
}
