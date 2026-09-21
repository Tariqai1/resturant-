import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStaffContext } from "@/lib/auth/staff-context";

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
    return NextResponse.json({ message: "Manager or Owner access required" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const sortOrder = body.sortOrder !== undefined ? Number(body.sortOrder) : 0;

  if (!name) {
    return NextResponse.json({ message: "Category name is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Check if category with same name already exists in this restaurant
  const { data: existing } = await admin
    .from("menu_categories")
    .select("id, name, is_archived")
    .eq("restaurant_id", staffContext.restaurantId)
    .ilike("name", name)
    .maybeSingle();

  if (existing) {
    if (existing.is_archived) {
      // Unarchive existing
      const { data: unarchived, error: unarchiveErr } = await admin
        .from("menu_categories")
        .update({ is_archived: false, sort_order: sortOrder })
        .eq("id", existing.id)
        .select("id, name, sort_order")
        .single();

      if (unarchiveErr) {
        return NextResponse.json({ message: unarchiveErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, category: unarchived }, { status: 200 });
    }

    return NextResponse.json({ message: `Category "${name}" already exists` }, { status: 400 });
  }

  const { data: newCategory, error } = await admin
    .from("menu_categories")
    .insert({
      restaurant_id: staffContext.restaurantId,
      name,
      sort_order: sortOrder,
      is_archived: false,
    })
    .select("id, name, sort_order")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, category: newCategory }, { status: 201 });
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
  if (!staffContext || (!staffContext.isSuperAdmin && !["admin", "owner", "manager"].includes(staffContext.role))) {
    return NextResponse.json({ message: "Manager or Owner access required" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { categoryId, name, sortOrder } = body;

  if (!categoryId) {
    return NextResponse.json({ message: "categoryId is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (sortOrder !== undefined) updates.sort_order = Number(sortOrder);

  const { data: updated, error } = await admin
    .from("menu_categories")
    .update(updates)
    .eq("id", categoryId)
    .eq("restaurant_id", staffContext.restaurantId)
    .select("id, name, sort_order")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, category: updated });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Staff authentication required" }, { status: 401 });
  }

  const staffContext = await resolveStaffContext(user);
  if (!staffContext || (!staffContext.isSuperAdmin && !["admin", "owner", "manager"].includes(staffContext.role))) {
    return NextResponse.json({ message: "Manager or Owner access required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("id");

  if (!categoryId) {
    return NextResponse.json({ message: "categoryId is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Reset items in this category so dishes don't get deleted
  await admin
    .from("menu_items")
    .update({ category_id: null })
    .eq("category_id", categoryId)
    .eq("restaurant_id", staffContext.restaurantId);

  const { error } = await admin
    .from("menu_categories")
    .delete()
    .eq("id", categoryId)
    .eq("restaurant_id", staffContext.restaurantId);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
