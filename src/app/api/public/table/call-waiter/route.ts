import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createWaiterCall,
  getActiveWaiterCalls,
  resolveWaiterCall,
  WaiterCallType,
} from "@/lib/platform/state";

// 1. GET: Fetch active waiter calls for a restaurant
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const restaurantId = searchParams.get("restaurantId") || undefined;
    const calls = getActiveWaiterCalls(restaurantId);
    return NextResponse.json({ ok: true, calls });
  } catch (error) {
    console.error("Fetch waiter calls error:", error);
    return NextResponse.json({ message: "Internal error" }, { status: 500 });
  }
}

// 2. POST: Customer triggers "Call Waiter"
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { token, type = "waiter", customNote, paymentMode } = body as {
      token?: string;
      type?: WaiterCallType;
      customNote?: string;
      paymentMode?: "upi" | "cash" | "card";
    };

    if (!token) {
      return NextResponse.json({ message: "Table token required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Verify table by QR token
    const { data: table, error } = await admin
      .from("restaurant_tables")
      .select("id, table_number, restaurant_id")
      .eq("qr_token", token)
      .maybeSingle();

    if (error || !table) {
      return NextResponse.json({ message: "Table not found" }, { status: 404 });
    }

    const newCall = createWaiterCall({
      tableId: table.id,
      tableNumber: table.table_number,
      restaurantId: table.restaurant_id,
      type: (type || "waiter") as WaiterCallType,
      customNote: customNote || undefined,
      paymentMode: paymentMode || undefined,
    });

    // Trigger background notification dispatch (WhatsApp/Webhook)
    try {
      const origin = request.nextUrl.origin || "http://localhost:3000";
      fetch(`${origin}/api/notifications/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "WAITER_CALL",
          restaurantId: table.restaurant_id,
          tableNumber: table.table_number,
          callType: type || "waiter",
        }),
      }).catch(() => undefined);
    } catch {
      // non-blocking
    }

    return NextResponse.json({
      ok: true,
      message: `Buzzer sent! Staff notified for Table ${table.table_number}.`,
      call: newCall,
    });
  } catch (error) {
    console.error("Create waiter call error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

// 3. PATCH: Staff resolves/dismisses the call buzzer
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { callId } = body as { callId?: string };

    if (!callId) {
      return NextResponse.json({ message: "callId is required" }, { status: 400 });
    }

    const success = resolveWaiterCall(callId);
    if (!success) {
      return NextResponse.json({ message: "Call request not found or already resolved" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, message: "Call acknowledged" });
  } catch (error) {
    console.error("Resolve waiter call error:", error);
    return NextResponse.json({ message: "Internal error" }, { status: 500 });
  }
}
