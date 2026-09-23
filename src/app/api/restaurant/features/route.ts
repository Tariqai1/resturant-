import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveStaffContext } from "@/lib/auth/staff-context";
import { getRestaurantFeatures, setRestaurantFeatures, RestaurantFeatures } from "@/lib/platform/state";

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

    const features = getRestaurantFeatures(staffContext.restaurantId);
    return NextResponse.json({ ok: true, features });
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

    const allowedRoles = ["owner", "manager", "admin"];
    if (staffContext.role && !allowedRoles.includes(staffContext.role.toLowerCase())) {
      return NextResponse.json(
        { ok: false, message: "Unauthorized. Manager or Owner role required to configure features." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const partialFeatures = body as Partial<RestaurantFeatures>;

    const updated = setRestaurantFeatures(staffContext.restaurantId, partialFeatures);
    return NextResponse.json({ ok: true, features: updated });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
