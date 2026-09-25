import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
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

    // Resolve current user's restaurant_id
    const { data: staffMember } = await admin
      .from("staff_users")
      .select("id, restaurant_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const cookieStore = await cookies();
    const impersonateCookie = cookieStore.get("od_impersonate_resto")?.value;
    let restaurantId = staffMember?.restaurant_id || null;
    if (impersonateCookie) {
      try {
        const parsed = JSON.parse(impersonateCookie);
        if (parsed.id) restaurantId = parsed.id;
      } catch {}
    }

    let targetOrderId = orderId || null;
    let targetTableId = tableId || null;
    let activeOrderSessionId: string | null = null;

    // 1. If direct orderId provided, fetch order details directly
    if (targetOrderId) {
      const { data: directOrd } = await admin
        .from("orders")
        .select("id, table_id, table_session_id, status")
        .eq("id", targetOrderId)
        .maybeSingle();

      if (directOrd) {
        targetTableId = targetTableId || directOrd.table_id;
        activeOrderSessionId = directOrd.table_session_id || null;
      }
    }

    // 2. If tableId not known yet, resolve from tableNumber scoped by restaurant
    if (!targetTableId && tableNumber) {
      // First try exact match scoped by restaurant
      let tableQuery = admin
        .from("restaurant_tables")
        .select("id, table_number")
        .eq("table_number", String(tableNumber).trim());

      if (restaurantId) {
        tableQuery = tableQuery.eq("restaurant_id", restaurantId);
      }

      const { data: tableData } = await tableQuery.maybeSingle();
      if (tableData) {
        targetTableId = tableData.id;
      } else {
        // Try variants (e.g. "T01" -> "1", "T1", "01")
        const raw = String(tableNumber).trim();
        const digits = raw.replace(/\D/g, "");
        const num = digits ? parseInt(digits, 10).toString() : raw;
        const variants = Array.from(new Set([
          raw,
          `T${num}`,
          `T0${num}`,
          `Table ${num}`,
          `Table T${num}`,
          num
        ]));

        let altQuery = admin
          .from("restaurant_tables")
          .select("id, table_number")
          .in("table_number", variants);

        if (restaurantId) {
          altQuery = altQuery.eq("restaurant_id", restaurantId);
        }

        const { data: altList } = await altQuery.limit(1);
        if (altList && altList.length > 0) {
          targetTableId = altList[0].id;
        }
      }
    }

    // 3. If targetOrderId still not known, find the open order on this table
    if (!targetOrderId && targetTableId) {
      const { data: activeOrder } = await admin
        .from("orders")
        .select("id, table_id, table_session_id, restaurant_id")
        .eq("table_id", targetTableId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeOrder) {
        targetOrderId = activeOrder.id;
        activeOrderSessionId = activeOrder.table_session_id || null;
      } else {
        // Table has no open order, ensure it is set to empty and return success
        await admin
          .from("restaurant_tables")
          .update({ status: "empty" })
          .eq("id", targetTableId);

        return NextResponse.json({
          ok: true,
          message: "No active order on table. Table status reset to available.",
        });
      }
    }

    if (!targetOrderId) {
      // If table exists but has no active order, free table
      if (targetTableId) {
        await admin
          .from("restaurant_tables")
          .update({ status: "empty" })
          .eq("id", targetTableId);

        return NextResponse.json({
          ok: true,
          message: "No active order found. Table freed successfully.",
        });
      }

      return NextResponse.json({ message: "Unable to locate table or active order for settlement." }, { status: 400 });
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

    // 0. Idempotency Check: Prevent duplicate billing on double-clicks or concurrent requests
    const { data: existingBill } = await admin
      .from("bills")
      .select("id, subtotal, tax_amount, total, payment_mode, payment_status, paid_at")
      .eq("order_id", targetOrderId)
      .maybeSingle();

    let billRecord = existingBill;

    if (!billRecord) {
      // 1. Insert Paid Bill
      const { data: newBill, error: billErr } = await admin
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
        // If concurrent request won the race, fetch the created bill
        const { data: racedBill } = await admin
          .from("bills")
          .select("id, subtotal, tax_amount, total, payment_mode, payment_status, paid_at")
          .eq("order_id", targetOrderId)
          .maybeSingle();

        if (racedBill) {
          billRecord = racedBill;
        } else {
          return NextResponse.json({ message: billErr.message }, { status: 500 });
        }
      } else {
        billRecord = newBill;
      }
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
