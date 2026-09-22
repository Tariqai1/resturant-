import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import {
  logActivity,
  archiveRestaurant,
  restoreRestaurant,
  isRestaurantArchived,
  getRestaurantTheme,
  setRestaurantTheme,
  getRestaurantFeatures,
  setRestaurantFeatures,
  getRestaurantPhone,
  setRestaurantPhone,
} from "@/lib/platform/state";

export async function GET(request: Request) {
  const authCheck = await requireSuperAdmin();
  if (!authCheck.authorized) {
    return NextResponse.json(
      { ok: false, message: authCheck.reason || "Unauthorized" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("q")?.trim().toLowerCase() || "";
  const plan = searchParams.get("plan") || "all";
  const status = searchParams.get("status") || "all";

  const admin = createAdminClient();

  try {
    const [restaurantsRes, staffRes, tablesRes, ordersRes, billsRes] = await Promise.all([
      admin.from("restaurants").select("*").order("created_at", { ascending: false }),
      admin.from("staff_users").select("id, restaurant_id, name, role, is_active"),
      admin.from("restaurant_tables").select("id, restaurant_id, table_number, status, qr_token"),
      admin.from("orders").select("id, restaurant_id, status"),
      admin.from("bills").select("id, total, payment_status, order:orders(restaurant_id)"),
    ]);

    let restaurants = restaurantsRes.data || [];
    const staffList = staffRes.data || [];
    const tablesList = tablesRes.data || [];
    const ordersList = ordersRes.data || [];
    const billsList = billsRes.data || [];

    if (search) {
      restaurants = restaurants.filter(
        (r) =>
          r.name?.toLowerCase().includes(search) ||
          r.owner_email?.toLowerCase().includes(search) ||
          r.gstin?.toLowerCase().includes(search) ||
          r.id?.toLowerCase().includes(search)
      );
    }

    if (plan !== "all") {
      restaurants = restaurants.filter((r) => r.subscription_plan === plan);
    }

    if (status === "archived") {
      restaurants = restaurants.filter(
        (r) => r.subscription_status === "cancelled" || isRestaurantArchived(r.id)
      );
    } else if (status === "active") {
      restaurants = restaurants.filter(
        (r) => r.subscription_status === "active" && !isRestaurantArchived(r.id)
      );
    } else if (status === "expired") {
      restaurants = restaurants.filter(
        (r) => r.subscription_status === "expired" && !isRestaurantArchived(r.id)
      );
    } else if (status !== "all") {
      restaurants = restaurants.filter((r) => r.subscription_status === status);
    }

    const detailedList = restaurants.map((r) => {
      const restoStaff = staffList.filter((s) => s.restaurant_id === r.id);
      const owner = restoStaff.find((s) => s.role === "owner") || restoStaff[0];
      const restoTables = tablesList.filter((t) => t.restaurant_id === r.id);
      const restoOrders = ordersList.filter((o) => o.restaurant_id === r.id);

      // Total GMV for this restaurant
      const restoGmv = billsList
        .filter((b) => {
          const ord = b.order as unknown as { restaurant_id: string } | null;
          return ord?.restaurant_id === r.id && b.payment_status === "paid";
        })
        .reduce((sum, b) => sum + (Number(b.total) || 0), 0);

      const archived = isRestaurantArchived(r.id) || r.subscription_status === "cancelled";

      return {
        id: r.id,
        name: r.name,
        ownerEmail: r.owner_email,
        ownerName: owner?.name || "Unassigned",
        contactPhone: getRestaurantPhone(r.id) || r.contact_phone || null,
        gstin: r.gstin,
        subscriptionPlan: r.subscription_plan || "trial",
        subscriptionStatus: r.subscription_status || "active",
        isArchived: archived,
        theme: getRestaurantTheme(r.id),
        features: getRestaurantFeatures(r.id),
        tables: restoTables.map((t) => ({
          id: t.id,
          table_number: t.table_number,
          qr_token: t.qr_token,
        })),
        firstTableToken: restoTables[0]?.qr_token || null,
        createdAt: r.created_at,
        stats: {
          tableCount: restoTables.length,
          activeTables: restoTables.filter((t) => t.status !== "empty").length,
          totalOrders: restoOrders.length,
          gmv: Math.round(restoGmv),
          staffCount: restoStaff.length,
        },
      };
    });

    return NextResponse.json({ ok: true, restaurants: detailedList });
  } catch (error) {
    console.error("Super Admin restaurants fetch failed:", error);
    return NextResponse.json(
      { ok: false, message: "Failed to load restaurants fleet" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authCheck = await requireSuperAdmin();
  if (!authCheck.authorized) {
    return NextResponse.json(
      { ok: false, message: authCheck.reason || "Unauthorized" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const name = body.name?.trim();
    const ownerName = body.ownerName?.trim();
    const ownerEmail = body.ownerEmail?.trim().toLowerCase();
    const contactPhone = body.contactPhone?.trim() || null;
    const gstin = body.gstin?.trim() || null;
    const pin = body.pin?.trim() || "1234";
    const plan = body.plan || "trial";
    const tableCount = Math.max(1, Math.min(50, Number(body.tableCount) || 6));
    const seedSampleMenu = Boolean(body.seedSampleMenu);

    if (!name || !ownerName || !ownerEmail) {
      return NextResponse.json(
        { ok: false, message: "Restaurant Name, Owner Name, and Owner Email are required" },
        { status: 400 }
      );
    }

    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json(
        { ok: false, message: "Owner Terminal PIN must be exactly 4 digits" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 1. Insert restaurant (using verified columns from Postgres schema)
    const { data: restaurant, error: restoError } = await admin
      .from("restaurants")
      .insert({
        name,
        owner_email: ownerEmail,
        gstin,
        subscription_plan: plan,
        subscription_status: "active",
      })
      .select("id, name")
      .single();

    if (restoError || !restaurant) {
      console.error("Restaurant insert failed:", restoError);
      return NextResponse.json(
        { ok: false, message: restoError?.message || "Failed to create restaurant record" },
        { status: 500 }
      );
    }

    // Persist phone in platform state
    if (contactPhone) {
      setRestaurantPhone(restaurant.id, contactPhone);
    }

    // 2. Hash PIN and create owner staff user
    const pinHash = await bcrypt.hash(pin, 10);
    const { error: staffError } = await admin.from("staff_users").insert({
      restaurant_id: restaurant.id,
      name: ownerName,
      role: "owner",
      pin_hash: pinHash,
      is_active: true,
    });

    if (staffError) {
      console.warn("Owner staff creation error:", staffError);
    }

    // 3. Generate tables
    const tableRows = Array.from({ length: tableCount }, (_, i) => {
      const num = (i + 1).toString().padStart(2, "0");
      return {
        restaurant_id: restaurant.id,
        table_number: `T${num}`,
        status: "empty",
      };
    });

    const { error: tablesError } = await admin
      .from("restaurant_tables")
      .insert(tableRows);

    if (tablesError) {
      console.warn("Table generation error:", tablesError);
    }

    // 4. Optionally seed sample menu
    if (seedSampleMenu) {
      const sampleCategories = [
        { name: "Starters", sort_order: 1 },
        { name: "Main Course", sort_order: 2 },
        { name: "Breads & Rice", sort_order: 3 },
        { name: "Beverages", sort_order: 4 },
      ];

      for (const cat of sampleCategories) {
        const { data: catRecord } = await admin
          .from("menu_categories")
          .insert({
            restaurant_id: restaurant.id,
            name: cat.name,
            sort_order: cat.sort_order,
          })
          .select("id")
          .single();

        if (catRecord) {
          let items: Array<{
            name: string;
            price: number;
            is_veg: boolean;
            is_bestseller: boolean;
            description: string;
          }> = [];

          if (cat.name === "Starters") {
            items = [
              { name: "Paneer Tikka", price: 280, is_veg: true, is_bestseller: true, description: "Charcoal grilled cottage cheese with spices" },
              { name: "Chicken Malai Tikka", price: 340, is_veg: false, is_bestseller: true, description: "Creamy cardamom marinated chicken cubes" },
              { name: "Crispy Corn", price: 220, is_veg: true, is_bestseller: false, description: "Golden corn tossed with lime and chat masala" },
            ];
          } else if (cat.name === "Main Course") {
            items = [
              { name: "Dal Makhani", price: 260, is_veg: true, is_bestseller: true, description: "Slow cooked black lentils with churned butter" },
              { name: "Butter Chicken", price: 380, is_veg: false, is_bestseller: true, description: "Clay oven roasted chicken in silky tomato makhani" },
              { name: "Paneer Butter Masala", price: 310, is_veg: true, is_bestseller: false, description: "Fresh cottage cheese in rich cashew gravy" },
            ];
          } else if (cat.name === "Breads & Rice") {
            items = [
              { name: "Butter Naan", price: 60, is_veg: true, is_bestseller: true, description: "Crispy tandoori refined flour bread" },
              { name: "Garlic Naan", price: 75, is_veg: true, is_bestseller: false, description: "Topped with fresh minced garlic and coriander" },
              { name: "Chicken Dum Biryani", price: 360, is_veg: false, is_bestseller: true, description: "Aromatic basmati rice cooked on slow flame with raita" },
            ];
          } else if (cat.name === "Beverages") {
            items = [
              { name: "Masala Chai", price: 40, is_veg: true, is_bestseller: true, description: "Brewed with ginger, cardamom, and clove" },
              { name: "Fresh Lime Soda", price: 90, is_veg: true, is_bestseller: false, description: "Sweet & salty refreshing cooler" },
            ];
          }

          if (items.length > 0) {
            await admin.from("menu_items").insert(
              items.map((it) => ({
                restaurant_id: restaurant.id,
                category_id: catRecord.id,
                name: it.name,
                price: it.price,
                is_veg: it.is_veg,
                is_bestseller: it.is_bestseller,
                is_available: true,
                description: it.description,
              }))
            );
          }
        }
      }
    }

    logActivity({
      action: "ONBOARD",
      actorEmail: authCheck.user?.email || "super-admin",
      targetId: restaurant.id,
      targetName: restaurant.name,
      details: `Onboarded new restaurant "${restaurant.name}" (${tableCount} tables, plan: ${plan})`,
    });

    return NextResponse.json({
      ok: true,
      message: `Restaurant "${restaurant.name}" successfully onboarded with ${tableCount} tables`,
      restaurantId: restaurant.id,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        ownerName,
        ownerEmail,
        contactPhone,
        pin,
        tableCount,
      },
    });
  } catch (error) {
    console.error("Super admin onboarding error:", error);
    return NextResponse.json(
      { ok: false, message: "Failed to onboard restaurant" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const authCheck = await requireSuperAdmin();
  if (!authCheck.authorized) {
    return NextResponse.json(
      { ok: false, message: authCheck.reason || "Unauthorized" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { id, ids, subscription_plan, subscription_status, name, gstin, action, theme, features } = body;

    const targetIds: string[] = Array.isArray(ids) && ids.length > 0 ? ids : (id ? [id] : []);

    if (targetIds.length === 0) {
      return NextResponse.json({ ok: false, message: "Restaurant ID or IDs required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Batch Operation for multiple restaurants
    if (targetIds.length > 1) {
      if (features && typeof features === "object") {
        for (const tid of targetIds) {
          setRestaurantFeatures(tid, features);
        }
      }
      if (theme === "amber" || theme === "crimson") {
        for (const tid of targetIds) {
          setRestaurantTheme(tid, theme);
        }
      }
      const batchUpdates: Record<string, unknown> = {};
      if (subscription_status) batchUpdates.subscription_status = subscription_status;
      if (subscription_plan) batchUpdates.subscription_plan = subscription_plan;

      if (Object.keys(batchUpdates).length > 0) {
        const { error } = await admin.from("restaurants").update(batchUpdates).in("id", targetIds);
        if (error) {
          return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
        }
      }

      logActivity({
        action: "STATUS_CHANGE",
        actorEmail: authCheck.user?.email || "super-admin",
        details: `Batch updated ${targetIds.length} restaurants: ${[
          features ? "Feature entitlements" : null,
          subscription_status ? `Status -> ${subscription_status}` : null,
          subscription_plan ? `Plan -> ${subscription_plan}` : null,
        ].filter(Boolean).join(", ")}`,
      });

      return NextResponse.json({
        ok: true,
        message: `Successfully updated ${targetIds.length} restaurants`,
        count: targetIds.length,
      });
    }

    // Single Restaurant Operation
    const singleId = targetIds[0];

    // Fetch existing restaurant name
    const { data: existingResto } = await admin
      .from("restaurants")
      .select("id, name, subscription_status, subscription_plan")
      .eq("id", singleId)
      .single();

    const targetName = name || existingResto?.name || "Restaurant";
    const updates: Record<string, unknown> = {};

    if (action === "archive" || subscription_status === "cancelled") {
      updates.subscription_status = "cancelled";
      archiveRestaurant({
        id: singleId,
        name: targetName,
        archivedAt: new Date().toISOString(),
        archivedBy: authCheck.user?.email || "super-admin",
      });
      logActivity({
        action: "ARCHIVE",
        actorEmail: authCheck.user?.email || "super-admin",
        targetId: singleId,
        targetName,
        details: `Archived restaurant "${targetName}". Financial ledger and GST audit data preserved.`,
      });
    } else if (action === "restore" || (subscription_status === "active" && existingResto?.subscription_status === "cancelled")) {
      updates.subscription_status = "active";
      restoreRestaurant(singleId);
      logActivity({
        action: "RESTORE",
        actorEmail: authCheck.user?.email || "super-admin",
        targetId: singleId,
        targetName,
        details: `Restored restaurant "${targetName}" back to active status.`,
      });
    } else {
      if (subscription_status) {
        updates.subscription_status = subscription_status;
        logActivity({
          action: "STATUS_CHANGE",
          actorEmail: authCheck.user?.email || "super-admin",
          targetId: singleId,
          targetName,
          details: `Changed outlet status to "${subscription_status}" for "${targetName}"`,
        });
      }
      if (subscription_plan) {
        updates.subscription_plan = subscription_plan;
        logActivity({
          action: "PLAN_CHANGE",
          actorEmail: authCheck.user?.email || "super-admin",
          targetId: singleId,
          targetName,
          details: `Updated subscription tier to "${subscription_plan}" for "${targetName}"`,
        });
      }
    }

    if (name) updates.name = name.trim();
    if (gstin !== undefined) updates.gstin = gstin?.trim() || null;

    if (theme === "amber" || theme === "crimson") {
      setRestaurantTheme(singleId, theme);
      logActivity({
        action: "STATUS_CHANGE",
        actorEmail: authCheck.user?.email || "super-admin",
        targetId: singleId,
        targetName,
        details: `Updated theme palette to "${theme === "amber" ? "Amber Gold (#FFBE0B)" : "Velvet Crimson (#741A2F)"}" for "${targetName}"`,
      });
    }

    if (features && typeof features === "object") {
      setRestaurantFeatures(singleId, features);
      logActivity({
        action: "STATUS_CHANGE",
        actorEmail: authCheck.user?.email || "super-admin",
        targetId: singleId,
        targetName,
        details: `Updated feature entitlements switchboard for "${targetName}"`,
      });
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await admin.from("restaurants").update(updates).eq("id", singleId);
      if (error) {
        return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, message: "Restaurant updated successfully" });
  } catch (error) {
    console.error("Super Admin restaurant update error:", error);
    return NextResponse.json({ ok: false, message: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authCheck = await requireSuperAdmin();
  if (!authCheck.authorized || !authCheck.user) {
    return NextResponse.json(
      { ok: false, message: authCheck.reason || "Unauthorized" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const idFromQuery = searchParams.get("id");
  const permanentFromQuery = searchParams.get("permanent") === "true";

  let id = idFromQuery;
  let permanent = permanentFromQuery;
  let action = searchParams.get("action") || "";

  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      const body = await request.json();
      if (body.id) id = body.id;
      if (body.permanent !== undefined) permanent = Boolean(body.permanent);
      if (body.action) action = body.action;
    } catch {
      // ignore
    }
  }

  if (!id) {
    return NextResponse.json({ ok: false, message: "Restaurant ID required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: resto } = await admin
    .from("restaurants")
    .select("id, name, owner_email, subscription_status")
    .eq("id", id)
    .single();

  if (!resto) {
    return NextResponse.json({ ok: false, message: "Restaurant not found" }, { status: 404 });
  }

  // 1. If action is restore
  if (action === "restore") {
    await admin.from("restaurants").update({ subscription_status: "active" }).eq("id", id);
    restoreRestaurant(id);
    logActivity({
      action: "RESTORE",
      actorEmail: authCheck.user?.email || "super-admin",
      targetId: id,
      targetName: resto.name,
      details: `Restored restaurant "${resto.name}" back to active service.`,
    });
    return NextResponse.json({
      ok: true,
      message: `Restaurant "${resto.name}" restored to active status`,
    });
  }

  // 2. Check orders count for compliance
  const { count: orderCount } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", id);

  const totalOrders = orderCount || 0;

  // 3. Permanent hard delete requested
  if (permanent) {
    if (totalOrders > 0) {
      return NextResponse.json(
        {
          ok: false,
          requiresArchive: true,
          message: `Cannot permanently delete "${resto.name}". This outlet has ${totalOrders} registered orders in its ledger. For GST and financial compliance, please Archive instead.`,
        },
        { status: 400 }
      );
    }

    // Cleanly delete related rows for 0-order test outlet
    await admin.from("menu_items").delete().eq("restaurant_id", id);
    await admin.from("menu_categories").delete().eq("restaurant_id", id);
    await admin.from("restaurant_tables").delete().eq("restaurant_id", id);
    await admin.from("staff_users").delete().eq("restaurant_id", id);
    const { error: delErr } = await admin.from("restaurants").delete().eq("id", id);

    if (delErr) {
      return NextResponse.json({ ok: false, message: delErr.message }, { status: 500 });
    }

    restoreRestaurant(id);
    logActivity({
      action: "DELETE",
      actorEmail: authCheck.user?.email || "super-admin",
      targetId: id,
      targetName: resto.name,
      details: `Permanently deleted demo/test restaurant "${resto.name}" (0 orders).`,
    });

    return NextResponse.json({
      ok: true,
      message: `Test outlet "${resto.name}" permanently deleted from platform`,
    });
  }

  // 4. Soft Delete / Archival
  await admin.from("restaurants").update({ subscription_status: "cancelled" }).eq("id", id);
  archiveRestaurant({
    id: resto.id,
    name: resto.name,
    archivedAt: new Date().toISOString(),
    archivedBy: authCheck.user?.email || "super-admin",
    reason: "Super Admin archival",
  });

  logActivity({
    action: "ARCHIVE",
    actorEmail: authCheck.user?.email || "super-admin",
    targetId: id,
    targetName: resto.name,
    details: `Archived restaurant "${resto.name}". Financial audit history preserved.`,
  });

  return NextResponse.json({
    ok: true,
    message: `Restaurant "${resto.name}" archived successfully. Billing and GST records are securely preserved.`,
  });
}
