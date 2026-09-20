import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStaffContext } from "@/lib/auth/staff-context";

export async function GET() {
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

  const [restaurantResult, tablesResult] = await Promise.all([
    admin.from("restaurants").select("id, name").eq("id", staffContext.restaurantId).maybeSingle(),
    admin
      .from("restaurant_tables")
      .select("id, table_number, qr_token, status, created_at")
      .eq("restaurant_id", staffContext.restaurantId)
      .order("table_number", { ascending: true }),
  ]);

  return NextResponse.json({
    ok: true,
    restaurant: restaurantResult.data || { id: staffContext.restaurantId, name: staffContext.restaurantName },
    tables: tablesResult.data ?? [],
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Staff authentication required" }, { status: 401 });
  }

  const staffContext = await resolveStaffContext(user);
  if (!staffContext || (!staffContext.isSuperAdmin && !["admin", "owner", "manager"].includes(staffContext.role))) {
    return NextResponse.json({ message: "Admin access required" }, { status: 403 });
  }

  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));
  const tableNumber = String(body.tableNumber ?? "").trim().toUpperCase();

  if (!tableNumber) {
    return NextResponse.json({ message: "Table number is required (e.g. T09 or 9)" }, { status: 400 });
  }

  const qrToken = crypto.randomBytes(16).toString("hex");

  const { data: newTable, error } = await admin
    .from("restaurant_tables")
    .insert({
      restaurant_id: staffContext.restaurantId,
      table_number: tableNumber,
      qr_token: qrToken,
      status: "empty",
    })
    .select("id, table_number, qr_token, status")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ message: `Table ${tableNumber} already exists` }, { status: 409 });
    }
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, table: newTable }, { status: 201 });
}

export async function PATCH(request: Request) {
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
  const body = await request.json().catch(() => ({}));
  const { tableId, action, status } = body;

  if (!tableId) {
    return NextResponse.json({ message: "tableId is required" }, { status: 400 });
  }

  if (action === "regenerate_token") {
    if (!staffContext.isSuperAdmin && !["admin", "owner", "manager"].includes(staffContext.role)) {
      return NextResponse.json({ message: "Admin access required" }, { status: 403 });
    }

    const newQrToken = crypto.randomBytes(16).toString("hex");
    const { data: updated, error } = await admin
      .from("restaurant_tables")
      .update({ qr_token: newQrToken })
      .eq("id", tableId)
      .eq("restaurant_id", staffContext.restaurantId)
      .select("id, table_number, qr_token, status")
      .single();

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, table: updated });
  }

  if (action === "update_status" && status) {
    const { data: updated, error } = await admin
      .from("restaurant_tables")
      .update({ status })
      .eq("id", tableId)
      .eq("restaurant_id", staffContext.restaurantId)
      .select("id, table_number, qr_token, status")
      .single();

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, table: updated });
  }

  return NextResponse.json({ message: "Invalid action" }, { status: 400 });
}
