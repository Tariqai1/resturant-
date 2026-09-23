import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRestaurantTheme, getRestaurantFeatures, getOrderPrepTime, getRestaurantOfferConfig, getRestaurantBranding, getRestaurantUpsellConfig } from "@/lib/platform/state";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ message: "Table token is required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Fetch table by QR token
    const { data: table, error: tableError } = await admin
      .from("restaurant_tables")
      .select("id, restaurant_id, table_number, status, qr_token")
      .eq("qr_token", token)
      .maybeSingle();

    if (tableError || !table) {
      return NextResponse.json({ message: "Invalid or expired table QR code" }, { status: 404 });
    }

    // 2. Fetch Restaurant Profile
    const { data: restaurant } = await admin
      .from("restaurants")
      .select("id, name")
      .eq("id", table.restaurant_id)
      .maybeSingle();

    // 3. Fetch Categories
    const { data: categories } = await admin
      .from("menu_categories")
      .select("id, name, sort_order")
      .eq("restaurant_id", table.restaurant_id)
      .order("sort_order", { ascending: true });

    // 4. Fetch Menu Items
    const { data: items } = await admin
      .from("menu_items")
      .select("id, category_id, name, description, price, is_veg, is_available, is_bestseller, photo_url")
      .eq("restaurant_id", table.restaurant_id)
      .order("name", { ascending: true });

    // 5. Fetch Active Order (if any exists for this table)
    let { data: openOrder } = await admin
      .from("orders")
      .select(`
        id,
        status,
        opened_at,
        table_session_id,
        order_items (
          id,
          menu_item_id,
          customer_name,
          qty,
          unit_price,
          notes,
          item_status,
          created_at,
          menu_items (name, is_veg)
        )
      `)
      .eq("table_id", table.id)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let joinedNotice: string | null = null;
    if (openOrder?.table_session_id?.startsWith("merged_into:")) {
      const masterTableNum = openOrder.table_session_id.replace("merged_into:", "").trim();
      joinedNotice = `Table ${table.table_number} is joined with Table ${masterTableNum}. Items will join the combined group bill.`;

      const { data: masterTable } = await admin
        .from("restaurant_tables")
        .select("id")
        .eq("restaurant_id", table.restaurant_id)
        .eq("table_number", masterTableNum)
        .maybeSingle();

      if (masterTable) {
        const { data: masterOrder } = await admin
          .from("orders")
          .select(`
            id,
            status,
            opened_at,
            table_session_id,
            order_items (
              id,
              menu_item_id,
              customer_name,
              qty,
              unit_price,
              notes,
              item_status,
              created_at,
              menu_items (name, is_veg)
            )
          `)
          .eq("table_id", masterTable.id)
          .eq("status", "open")
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (masterOrder) {
          openOrder = masterOrder;
        }
      }
    } else if (openOrder?.table_session_id?.startsWith("joined:")) {
      const otherTables = openOrder.table_session_id
        .replace("joined:", "")
        .split(",")
        .map((s: string) => s.trim())
        .filter((t: string) => t !== table.table_number);
      if (otherTables.length > 0) {
        joinedNotice = `Joined with Table ${otherTables.join(", ")} (Group Table)`;
      }
    }

    // If an open order was created over 12 hours ago, treat table as fresh
    let validOpenOrder = openOrder;
    if (openOrder && openOrder.opened_at) {
      const ageHours = (Date.now() - new Date(openOrder.opened_at).getTime()) / (1000 * 60 * 60);
      if (ageHours > 12) {
        validOpenOrder = null;
      }
    }

    const theme = getRestaurantTheme(table.restaurant_id);
    const branding = getRestaurantBranding(table.restaurant_id);
    const features = getRestaurantFeatures(table.restaurant_id);
    const offerConfig = getRestaurantOfferConfig(table.restaurant_id);
    const upsellConfig = getRestaurantUpsellConfig(table.restaurant_id);
    const prepEstimate = validOpenOrder ? getOrderPrepTime(validOpenOrder.id) : null;

    return NextResponse.json({
      ok: true,
      theme,
      branding,
      features,
      offerConfig,
      upsellConfig,
      table: {
        id: table.id,
        table_number: table.table_number,
        status: table.status,
      },
      restaurant: restaurant || { name: "Order Desk Restaurant" },
      categories: categories || [],
      items: items || [],
      activeOrder: validOpenOrder ? { ...validOpenOrder, prepEstimate } : null,
      joinedNotice,
    });
  } catch (error) {
    console.error("Public table fetch error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
