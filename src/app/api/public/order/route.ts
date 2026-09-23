import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";

type OrderItemPayload = {
  menuItemId: string;
  qty: number;
  notes?: string;
};

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown-client";
    const body = await request.json();
    const { token, customerName, items } = body as {
      token: string;
      customerName?: string;
      items: OrderItemPayload[];
    };

    if (!token || typeof token !== "string" || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { message: "Invalid order submission. Missing table token or items." },
        { status: 400 }
      );
    }

    // Rate Limiting: Max 6 order batches per table token per 2 minutes
    const rateKey = `order:${token}:${ip}`;
    const rateCheck = checkRateLimit(rateKey, 6, 2 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { message: "Order rate limit reached. Please wait 2 minutes before placing another order." },
        { status: 429 }
      );
    }

    const admin = createAdminClient();

    // 1. Verify Table Token
    const { data: table, error: tableError } = await admin
      .from("restaurant_tables")
      .select("id, restaurant_id, table_number, status")
      .eq("qr_token", token.trim())
      .maybeSingle();

    if (tableError || !table) {
      return NextResponse.json({ message: "Table not found or invalid token." }, { status: 404 });
    }

    // 2. Fetch authoritative menu prices from database
    const itemIds = items
      .filter((i) => i && typeof i.menuItemId === "string")
      .map((i) => i.menuItemId);

    if (itemIds.length === 0) {
      return NextResponse.json({ message: "No valid menu items specified." }, { status: 400 });
    }

    const { data: menuItems, error: menuError } = await admin
      .from("menu_items")
      .select("id, price, is_available")
      .eq("restaurant_id", table.restaurant_id)
      .in("id", itemIds);

    if (menuError || !menuItems || menuItems.length === 0) {
      return NextResponse.json({ message: "Selected dishes not found in catalog." }, { status: 400 });
    }

    const priceMap = new Map<string, number>();
    for (const mi of menuItems) {
      if (!mi.is_available) {
        return NextResponse.json(
          { message: "One or more dishes in your cart are currently sold out." },
          { status: 400 }
        );
      }
      priceMap.set(mi.id, Number(mi.price));
    }

    // 3. Find or Create Open Order for this Table
    let { data: currentOrder } = await admin
      .from("orders")
      .select("id, table_session_id")
      .eq("table_id", table.id)
      .eq("status", "open")
      .maybeSingle();

    // If this table was merged into another table, route items to the master group order
    if (currentOrder?.table_session_id?.startsWith("merged_into:")) {
      const masterTableNumber = currentOrder.table_session_id.replace("merged_into:", "").trim();
      const { data: masterTable } = await admin
        .from("restaurant_tables")
        .select("id")
        .eq("restaurant_id", table.restaurant_id)
        .eq("table_number", masterTableNumber)
        .maybeSingle();

      if (masterTable) {
        const { data: masterOrder } = await admin
          .from("orders")
          .select("id, table_session_id")
          .eq("table_id", masterTable.id)
          .eq("status", "open")
          .maybeSingle();

        if (masterOrder) {
          currentOrder = masterOrder;
        }
      }
    }

    if (!currentOrder) {
      const { data: newOrder, error: createOrderError } = await admin
        .from("orders")
        .insert({
          restaurant_id: table.restaurant_id,
          table_id: table.id,
          status: "open",
        })
        .select("id, table_session_id")
        .single();

      if (createOrderError || !newOrder) {
        throw new Error(createOrderError?.message || "Failed to initiate table order.");
      }
      currentOrder = newOrder;
    }

    // 4. Sanitize and Insert Order Items
    const sanitizedCustomerName = customerName ? String(customerName).trim().slice(0, 50) : null;

    const itemsToInsert = items
      .filter((i) => i && priceMap.has(i.menuItemId))
      .map((i) => {
        const cleanQty = Math.max(1, Math.min(30, Math.floor(Number(i.qty)) || 1));
        const cleanNotes = i.notes ? String(i.notes).trim().slice(0, 200) : null;
        return {
          order_id: currentOrder!.id,
          menu_item_id: i.menuItemId,
          qty: cleanQty,
          unit_price: priceMap.get(i.menuItemId)!,
          notes: cleanNotes,
          item_status: "pending" as const,
          customer_name: sanitizedCustomerName,
        };
      });

    if (itemsToInsert.length === 0) {
      return NextResponse.json({ message: "No valid order items could be added." }, { status: 400 });
    }

    const { data: insertedItems, error: insertItemsError } = await admin
      .from("order_items")
      .insert(itemsToInsert)
      .select("id, unit_price, qty");

    if (insertItemsError) {
      throw new Error(insertItemsError.message || "Failed to save order items.");
    }

    // 5. Check if Waiter/Captain Order Approval is enabled for this restaurant
    const { getRestaurantFeatures, registerPendingOrderBatch } = await import("@/lib/platform/state");
    const features = getRestaurantFeatures(table.restaurant_id);

    if (features.waiterOrderApproval) {
      const insertedItemIds = (insertedItems || []).map((i) => i.id);
      const totalBatchAmount = (insertedItems || []).reduce((acc, i) => acc + (Number(i.unit_price) * Number(i.qty)), 0);
      const totalBatchQty = (insertedItems || []).reduce((acc, i) => acc + Number(i.qty), 0);

      registerPendingOrderBatch({
        orderId: currentOrder!.id,
        restaurantId: table.restaurant_id,
        tableId: table.id,
        tableNumber: table.table_number,
        customerName: sanitizedCustomerName,
        itemIds: insertedItemIds,
        totalAmount: totalBatchAmount,
        totalItems: totalBatchQty,
      });

      // Set table status to pending
      await admin
        .from("restaurant_tables")
        .update({ status: "pending" })
        .eq("id", table.id);

      return NextResponse.json({
        ok: true,
        approvalPending: true,
        message: "Order placed! Our floor captain will verify your items at your table shortly before kitchen dispatch.",
        orderId: currentOrder!.id,
        itemCount: itemsToInsert.length,
      });
    }

    // 6. Direct Kitchen Dispatch (Approval disabled)
    if (table.status === "empty" || table.status === "served") {
      await admin
        .from("restaurant_tables")
        .update({ status: "pending" })
        .eq("id", table.id);
    }

    return NextResponse.json({
      ok: true,
      approvalPending: false,
      message: "Order placed successfully! The kitchen is preparing your meal.",
      orderId: currentOrder!.id,
      itemCount: itemsToInsert.length,
    });
  } catch (error) {
    console.error("Order submission error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to place order." },
      { status: 500 }
    );
  }
}
