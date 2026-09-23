import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveStaffContext } from "@/lib/auth/staff-context";
import { getRestaurantUpsellConfig, setRestaurantUpsellConfig } from "@/lib/platform/state";
import type { SmartUpsellConfig } from "@/lib/types/offers";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, message: "Authentication required" }, { status: 401 });
    }

    const staffContext = await resolveStaffContext(user);
    if (!staffContext) {
      return NextResponse.json({ ok: false, message: "Staff record not found" }, { status: 403 });
    }

    const upsellConfig = getRestaurantUpsellConfig(staffContext.restaurantId);
    return NextResponse.json({ ok: true, upsellConfig });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, message: "Authentication required" }, { status: 401 });
    }

    const staffContext = await resolveStaffContext(user);
    if (!staffContext) {
      return NextResponse.json({ ok: false, message: "Staff record not found" }, { status: 403 });
    }

    // Role check: Only Owner, Manager, or Admin can configure
    const allowedRoles = ["owner", "manager", "admin"];
    if (staffContext.role && !allowedRoles.includes(staffContext.role.toLowerCase())) {
      return NextResponse.json(
        { ok: false, message: "Unauthorized. Manager or Owner role required to configure upsell." },
        { status: 403 }
      );
    }

    const currentConfig = getRestaurantUpsellConfig(staffContext.restaurantId);

    // Super Admin Delegation Check: Has Super Admin permitted owner configuration?
    if (currentConfig.ownerCanManageUpsell === false) {
      return NextResponse.json(
        {
          ok: false,
          message: "Smart Upsell settings are locked and centrally enforced by Platform Super Admin.",
        },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Partial<SmartUpsellConfig>;
    
    // Prevent the owner from overriding the super admin delegation flag
    delete body.ownerCanManageUpsell;

    const updated = setRestaurantUpsellConfig(staffContext.restaurantId, body);
    return NextResponse.json({
      ok: true,
      message: "Smart Upsell settings updated successfully",
      upsellConfig: updated,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
