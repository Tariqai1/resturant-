import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTableAccessCode } from "@/lib/utils/table-code";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = String(body.code ?? "").trim();

    if (!code) {
      return NextResponse.json({ message: "Table code is required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch all active tables
    const { data: tables, error } = await admin
      .from("restaurant_tables")
      .select("id, table_number, qr_token, restaurant_id, restaurants(name)");

    if (error || !tables || tables.length === 0) {
      return NextResponse.json({ message: "No tables found" }, { status: 404 });
    }

    // Match by:
    // 1. Exact 4-digit generated access code
    // 2. Direct table_number (e.g. T-03, T3, 3)
    const normalizedInput = code.toUpperCase().replace(/\s+/g, "");

    const matched = tables.find((t) => {
      const generated = getTableAccessCode(t.qr_token);
      if (generated === code) return true;

      const normTableNumber = t.table_number.toUpperCase().replace(/\s+/g, "");
      if (normTableNumber === normalizedInput) return true;
      if (normTableNumber.replace(/^T-?0*/, "") === normalizedInput.replace(/^T-?0*/, "")) return true;

      return false;
    });

    if (!matched) {
      return NextResponse.json(
        { message: "Table code not found. Please check the standee number." },
        { status: 404 }
      );
    }

    const restaurantObj = matched.restaurants as unknown as { name: string } | null;

    return NextResponse.json({
      ok: true,
      tableNumber: matched.table_number,
      restaurantName: restaurantObj?.name || "Order Desk",
      qrToken: matched.qr_token,
      redirectUrl: `/table/${matched.qr_token}`,
    });
  } catch (error) {
    console.error("Lookup code error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
