import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStaffContext } from "@/lib/auth/staff-context";
import { getDishSpecialTag, setDishSpecialTag } from "@/lib/platform/state";

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

  const [restaurantResult, categoriesResult, itemsResult, tablesResult] = await Promise.all([
    admin
      .from("restaurants")
      .select("id, name")
      .eq("id", staffContext.restaurantId)
      .maybeSingle(),
    admin
      .from("menu_categories")
      .select("id, name, sort_order, is_archived")
      .eq("restaurant_id", staffContext.restaurantId)
      .eq("is_archived", false)
      .order("sort_order", { ascending: true }),
    admin
      .from("menu_items")
      .select("id, category_id, name, description, price, cost_price, is_veg, is_available, is_bestseller, photo_url, created_at")
      .eq("restaurant_id", staffContext.restaurantId)
      .order("name", { ascending: true }),
    admin
      .from("restaurant_tables")
      .select("id, table_number, qr_token")
      .eq("restaurant_id", staffContext.restaurantId)
      .order("table_number", { ascending: true }),
  ]);

  const itemsWithTags = (itemsResult.data ?? []).map((item) => ({
    ...item,
    special_tag: getDishSpecialTag(item.id) || (item.is_bestseller ? "Chef's Special" : null),
  }));

  return NextResponse.json({
    ok: true,
    restaurantName: restaurantResult.data?.name || staffContext.restaurantName || "Order Desk",
    categories: categoriesResult.data ?? [],
    items: itemsWithTags,
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
  const { categoryId, name, description, price, costPrice, isVeg, isBestseller, photoUrl } = body;

  if (!name || price === undefined) {
    return NextResponse.json({ message: "Name and Price are required" }, { status: 400 });
  }

  const { data: newItem, error } = await admin
    .from("menu_items")
    .insert({
      restaurant_id: staffContext.restaurantId,
      category_id: categoryId || null,
      name: name.trim(),
      description: description ? description.trim() : null,
      price: Number(price),
      cost_price: costPrice ? Number(costPrice) : null,
      is_veg: Boolean(isVeg),
      is_bestseller: Boolean(isBestseller) || Boolean(body.specialTag),
      photo_url: photoUrl ? photoUrl.trim() : null,
      is_available: true,
    })
    .select("id, category_id, name, description, price, cost_price, is_veg, is_available, is_bestseller, photo_url, created_at")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const specialTagVal = body.specialTag !== undefined ? body.specialTag : (newItem.is_bestseller ? "Chef's Special" : null);
  if (specialTagVal) {
    setDishSpecialTag(newItem.id, specialTagVal);
  }

  return NextResponse.json({ ok: true, item: { ...newItem, special_tag: specialTagVal } }, { status: 201 });
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
  const { itemId, name, description, categoryId, price, costPrice, isVeg, isBestseller, isAvailable, photoUrl, specialTag } = body;

  if (!itemId) {
    return NextResponse.json({ message: "itemId is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (description !== undefined) updates.description = description ? String(description).trim() : null;
  if (categoryId !== undefined) updates.category_id = categoryId || null;
  if (price !== undefined) updates.price = Number(price);
  if (costPrice !== undefined) updates.cost_price = costPrice ? Number(costPrice) : null;
  if (isVeg !== undefined) updates.is_veg = Boolean(isVeg);
  if (isBestseller !== undefined) {
    updates.is_bestseller = Boolean(isBestseller);
  } else if (specialTag !== undefined) {
    updates.is_bestseller = Boolean(specialTag);
  }
  if (isAvailable !== undefined) updates.is_available = Boolean(isAvailable);
  if (photoUrl !== undefined) updates.photo_url = photoUrl ? String(photoUrl).trim() : null;

  const { data: updated, error } = await admin
    .from("menu_items")
    .update(updates)
    .eq("id", itemId)
    .eq("restaurant_id", staffContext.restaurantId)
    .select("id, category_id, name, description, price, cost_price, is_veg, is_available, is_bestseller, photo_url, created_at")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  if (specialTag !== undefined) {
    setDishSpecialTag(itemId, specialTag);
  }

  const finalTag = specialTag !== undefined ? specialTag : (getDishSpecialTag(updated.id) || (updated.is_bestseller ? "Chef's Special" : null));

  return NextResponse.json({ ok: true, item: { ...updated, special_tag: finalTag } });
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
    return NextResponse.json({ message: "Admin access required" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("id");

  if (!itemId) {
    return NextResponse.json({ message: "itemId is required" }, { status: 400 });
  }

  const { error } = await admin
    .from("menu_items")
    .delete()
    .eq("id", itemId)
    .eq("restaurant_id", staffContext.restaurantId);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
