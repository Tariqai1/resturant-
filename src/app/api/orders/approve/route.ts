import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdminUser } from "@/lib/auth/super-admin";
import {
  getActivePendingApprovals,
  approveOrderBatch,
  rejectOrderBatch,
  getPlatformState,
} from "@/lib/platform/state";

async function getCallerStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const isSuper = await isSuperAdminUser(user);
  const cookieStore = await cookies();
  const activeStaffRaw = cookieStore.get("od_active_staff")?.value;

  let staffId = user.id;
  let role = "staff";

  if (activeStaffRaw) {
    try {
      const parsed = JSON.parse(activeStaffRaw);
      staffId = parsed.staffId || user.id;
      role = parsed.role || "staff";
    } catch {
      // ignore
    }
  } else {
    const admin = createAdminClient();
    const { data: dbStaff } = await admin
      .from("staff_users")
      .select("id, role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (dbStaff) {
      staffId = dbStaff.id;
      role = dbStaff.role;
    }
  }

  return {
    user,
    staffId,
    role,
    isSuper,
  };
}

export async function GET(request: NextRequest) {
  try {
    const caller = await getCallerStaff();
    if (!caller) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const restaurantId = searchParams.get("restaurantId");

    if (!restaurantId) {
      return NextResponse.json({ message: "Missing restaurantId" }, { status: 400 });
    }

    const batches = getActivePendingApprovals(restaurantId);
    return NextResponse.json({ ok: true, batches });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const caller = await getCallerStaff();
    if (!caller) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { batchId, action, reason } = body as {
      batchId?: string;
      action?: "approve" | "reject";
      reason?: string;
    };

    if (!batchId || !action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { message: "Invalid request. Missing batchId or valid action ('approve' | 'reject')." },
        { status: 400 }
      );
    }

    const state = getPlatformState();
    const batch = state.pendingOrderApprovals?.[batchId];

    if (!batch) {
      return NextResponse.json({ message: "Order verification batch not found." }, { status: 404 });
    }

    if (batch.status !== "awaiting_approval") {
      return NextResponse.json(
        { message: `Batch has already been ${batch.status}.` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    if (action === "approve") {
      const updatedBatch = approveOrderBatch(batchId, caller.role);

      // Verify or update table status to pending (active orders)
      await admin
        .from("restaurant_tables")
        .update({ status: "pending" })
        .eq("id", batch.tableId);

      return NextResponse.json({
        ok: true,
        action: "approved",
        message: `Order for Table ${batch.tableNumber} approved and dispatched to Kitchen KOT.`,
        batch: updatedBatch,
      });
    }

    if (action === "reject") {
      const updatedBatch = rejectOrderBatch(batchId, reason || "Rejected by floor captain");

      // Delete the unapproved items from Supabase order_items to keep group bill clean
      if (batch.itemIds && batch.itemIds.length > 0) {
        await admin
          .from("order_items")
          .delete()
          .in("id", batch.itemIds);
      }

      // Check if order still has any items
      const { data: remainingItems } = await admin
        .from("order_items")
        .select("id")
        .eq("order_id", batch.orderId);

      if (!remainingItems || remainingItems.length === 0) {
        // Cancel the empty order
        await admin
          .from("orders")
          .update({ status: "cancelled" })
          .eq("id", batch.orderId);

        // Reset table status to empty if no other active orders
        await admin
          .from("restaurant_tables")
          .update({ status: "empty" })
          .eq("id", batch.tableId);
      }

      return NextResponse.json({
        ok: true,
        action: "rejected",
        message: `Order for Table ${batch.tableNumber} rejected and discarded.`,
        batch: updatedBatch,
      });
    }

    return NextResponse.json({ message: "Invalid action." }, { status: 400 });
  } catch (err: unknown) {
    console.error("Order approval error:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ message }, { status: 500 });
  }
}
