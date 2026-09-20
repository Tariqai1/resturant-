import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdminUser } from "@/lib/auth/super-admin";
import { getStaffPermissions } from "@/lib/platform/state";

async function getCallerPermissions() {
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

  const isOwnerOrManager = isSuper || ["owner", "manager", "admin"].includes(role);
  const perms = getStaffPermissions(staffId, role);

  return {
    user,
    staffId,
    role,
    isSuper,
    isOwnerOrManager,
    canEdit: isOwnerOrManager || perms.canEditOrders,
    canDelete: isOwnerOrManager || perms.canDeleteOrders,
  };
}

export async function POST(request: NextRequest) {
  try {
    const caller = await getCallerPermissions();
    if (!caller) {
      return NextResponse.json({ message: "Authentication required" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { action, orderId, itemId, qty } = body;

    const admin = createAdminClient();

    // 1. VOID / CANCEL ORDER
    if (action === "void_order" || action === "cancel_order") {
      if (!caller.canDelete) {
        return NextResponse.json(
          {
            message:
              "Permission Denied: Order deletion / voiding permission has not been granted to your staff profile by the restaurant owner.",
          },
          { status: 403 }
        );
      }

      if (!orderId) {
        return NextResponse.json({ message: "orderId is required" }, { status: 400 });
      }

      // Find order and table
      const { data: order } = await admin
        .from("orders")
        .select("id, table_id")
        .eq("id", orderId)
        .maybeSingle();

      if (!order) {
        return NextResponse.json({ message: "Order not found" }, { status: 404 });
      }

      // Mark order cancelled
      await admin.from("orders").update({ status: "cancelled" }).eq("id", orderId);

      // Reset table status to empty
      if (order.table_id) {
        await admin
          .from("restaurant_tables")
          .update({ status: "empty" })
          .eq("id", order.table_id);
      }

      return NextResponse.json({
        ok: true,
        message: "Order has been successfully voided and table freed.",
      });
    }

    // 2. EDIT ORDER (Add items, modify quantity, or delete specific item)
    if (action === "update_qty" || action === "remove_item") {
      if (!caller.canEdit) {
        return NextResponse.json(
          {
            message:
              "Permission Denied: Order editing permission has not been granted to your staff profile by the restaurant owner.",
          },
          { status: 403 }
        );
      }

      if (action === "update_qty") {
        if (!itemId || qty === undefined) {
          return NextResponse.json({ message: "itemId and qty required" }, { status: 400 });
        }

        if (Number(qty) <= 0) {
          await admin.from("order_items").delete().eq("id", itemId);
        } else {
          await admin
            .from("order_items")
            .update({ qty: Number(qty) })
            .eq("id", itemId);
        }

        return NextResponse.json({ ok: true, message: "Order item updated." });
      }

      if (action === "remove_item") {
        if (!itemId) {
          return NextResponse.json({ message: "itemId required" }, { status: 400 });
        }
        await admin.from("order_items").delete().eq("id", itemId);
        return NextResponse.json({ ok: true, message: "Item removed from order." });
      }
    }

    // 3. MERGE / JOIN TABLES (e.g. Table T02 joined with Table T01)
    if (action === "merge_tables") {
      const { sourceTableNumber, targetTableNumber } = body;
      if (!sourceTableNumber || !targetTableNumber) {
        return NextResponse.json(
          { message: "sourceTableNumber and targetTableNumber required" },
          { status: 400 }
        );
      }
      if (sourceTableNumber === targetTableNumber) {
        return NextResponse.json(
          { message: "Cannot merge table into itself" },
          { status: 400 }
        );
      }

      // Find both tables
      const { data: tables } = await admin
        .from("restaurant_tables")
        .select("id, table_number, status, restaurant_id")
        .in("table_number", [sourceTableNumber, targetTableNumber]);

      const sourceTable = tables?.find((t) => t.table_number === sourceTableNumber);
      const targetTable = tables?.find((t) => t.table_number === targetTableNumber);

      if (!sourceTable || !targetTable) {
        return NextResponse.json(
          { message: "One or both tables not found" },
          { status: 404 }
        );
      }

      // Find or create active order for target table
      let { data: targetOrder } = await admin
        .from("orders")
        .select("id, status, table_session_id")
        .eq("table_id", targetTable.id)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!targetOrder) {
        const { data: newOrder, error: createErr } = await admin
          .from("orders")
          .insert({
            restaurant_id: targetTable.restaurant_id,
            table_id: targetTable.id,
            status: "open",
            opened_at: new Date().toISOString(),
          })
          .select("id, status, table_session_id")
          .single();

        if (createErr) throw createErr;
        targetOrder = newOrder;
      }

      // Find active order for source table
      const { data: sourceOrder } = await admin
        .from("orders")
        .select("id, status, table_session_id")
        .eq("table_id", sourceTable.id)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let movedItemsCount = 0;
      if (sourceOrder && sourceOrder.id !== targetOrder.id) {
        // Move all items from sourceOrder to targetOrder
        const { data: movedItems } = await admin
          .from("order_items")
          .update({ order_id: targetOrder.id })
          .eq("order_id", sourceOrder.id)
          .select("id");

        movedItemsCount = movedItems?.length || 0;
      }

      // Update targetOrder table_session_id to record all joined tables
      const existingJoinedStr = targetOrder.table_session_id || "";
      const currentJoined = existingJoinedStr.startsWith("joined:")
        ? existingJoinedStr.replace("joined:", "").split(",").map((s: string) => s.trim())
        : [targetTableNumber];

      if (!currentJoined.includes(sourceTableNumber)) {
        currentJoined.push(sourceTableNumber);
      }
      if (!currentJoined.includes(targetTableNumber)) {
        currentJoined.unshift(targetTableNumber);
      }
      const newJoinedStr = `joined:${currentJoined.join(",")}`;

      await admin
        .from("orders")
        .update({ table_session_id: newJoinedStr })
        .eq("id", targetOrder.id);

      // In sourceTable, keep/create open order with table_session_id: "merged_into:T01"
      if (sourceOrder) {
        await admin
          .from("orders")
          .update({
            status: "open",
            table_session_id: `merged_into:${targetTableNumber}`,
          })
          .eq("id", sourceOrder.id);
      } else {
        await admin
          .from("orders")
          .insert({
            restaurant_id: sourceTable.restaurant_id,
            table_id: sourceTable.id,
            status: "open",
            opened_at: new Date().toISOString(),
            table_session_id: `merged_into:${targetTableNumber}`,
          });
      }

      // Mark source table as occupied (linked with targetTable)
      await admin
        .from("restaurant_tables")
        .update({ status: "served" })
        .eq("id", sourceTable.id);

      // Ensure target table is also served/occupied
      await admin
        .from("restaurant_tables")
        .update({ status: "served" })
        .eq("id", targetTable.id);

      return NextResponse.json({
        ok: true,
        message: `Table ${sourceTableNumber} successfully joined with Table ${targetTableNumber}. ${movedItemsCount > 0 ? `${movedItemsCount} active dishes merged into group bill.` : "Tables linked."}`,
        targetOrderId: targetOrder.id,
        joinedTables: currentJoined,
      });
    }

    // 4. TRANSFER / MOVE TABLE (e.g. Move party from Table T01 to Table T05)
    if (action === "transfer_table") {
      const { currentTableNumber, newTableNumber, orderId } = body;
      if (!currentTableNumber || !newTableNumber) {
        return NextResponse.json(
          { message: "currentTableNumber and newTableNumber required" },
          { status: 400 }
        );
      }

      const { data: tables } = await admin
        .from("restaurant_tables")
        .select("id, table_number")
        .in("table_number", [currentTableNumber, newTableNumber]);

      const curTable = tables?.find((t) => t.table_number === currentTableNumber);
      const nxtTable = tables?.find((t) => t.table_number === newTableNumber);

      if (!curTable || !nxtTable) {
        return NextResponse.json({ message: "Table records not found" }, { status: 404 });
      }

      // Locate active order
      let ordId = orderId;
      if (!ordId) {
        const { data: activeOrder } = await admin
          .from("orders")
          .select("id")
          .eq("table_id", curTable.id)
          .eq("status", "open")
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!activeOrder) {
          return NextResponse.json(
            { message: `No active order found on Table ${currentTableNumber}` },
            { status: 404 }
          );
        }
        ordId = activeOrder.id;
      }

      // Shift order to new table
      await admin.from("orders").update({ table_id: nxtTable.id }).eq("id", ordId);

      // Free previous table, mark new table occupied
      await admin.from("restaurant_tables").update({ status: "empty" }).eq("id", curTable.id);
      await admin.from("restaurant_tables").update({ status: "served" }).eq("id", nxtTable.id);

      return NextResponse.json({
        ok: true,
        message: `Order on Table ${currentTableNumber} transferred to Table ${newTableNumber}.`,
      });
    }

    return NextResponse.json({ message: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Manage order error:", err);
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Order operation failed" },
      { status: 500 }
    );
  }
}
