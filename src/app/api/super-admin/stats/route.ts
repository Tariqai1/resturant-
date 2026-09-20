import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/super-admin";

export async function GET() {
  const authCheck = await requireSuperAdmin();
  if (!authCheck.authorized) {
    return NextResponse.json(
      { ok: false, message: authCheck.reason || "Unauthorized" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  try {
    const [restaurantsRes, ordersRes, billsRes] = await Promise.all([
      admin.from("restaurants").select("id, name, subscription_plan, subscription_status, created_at"),
      admin.from("orders").select("id, status, opened_at"),
      admin.from("bills").select("id, total, payment_status, paid_at"),
    ]);

    const restaurants = restaurantsRes.data || [];
    const orders = ordersRes.data || [];
    const bills = billsRes.data || [];

    const totalRestaurants = restaurants.length;
    const activeRestaurants = restaurants.filter(
      (r) => r.subscription_status === "active"
    ).length;
    const expiredRestaurants = restaurants.filter(
      (r) => r.subscription_status !== "active"
    ).length;

    const planBreakdown = {
      trial: restaurants.filter((r) => r.subscription_plan === "trial").length,
      basic: restaurants.filter((r) => r.subscription_plan === "basic").length,
      pro: restaurants.filter((r) => r.subscription_plan === "pro").length,
    };

    const totalOrders = orders.length;

    // GMV: sum of paid bills
    const totalGmv = bills
      .filter((b) => b.payment_status === "paid")
      .reduce((sum, b) => sum + (Number(b.total) || 0), 0);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const todayOrders = orders.filter((o) => o.opened_at && o.opened_at >= startOfToday).length;
    const todayGmv = bills
      .filter((b) => b.payment_status === "paid" && b.paid_at && b.paid_at >= startOfToday)
      .reduce((sum, b) => sum + (Number(b.total) || 0), 0);

    return NextResponse.json({
      ok: true,
      stats: {
        totalRestaurants,
        activeRestaurants,
        expiredRestaurants,
        planBreakdown,
        totalOrders,
        totalGmv: Math.round(totalGmv),
        todayOrders,
        todayGmv: Math.round(todayGmv),
      },
    });
  } catch (error) {
    console.error("Failed to compute super admin stats:", error);
    return NextResponse.json(
      { ok: false, message: "Error calculating platform metrics" },
      { status: 500 }
    );
  }
}
