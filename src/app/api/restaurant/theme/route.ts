import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveStaffContext } from "@/lib/auth/staff-context";
import { getRestaurantTheme, setRestaurantTheme, RestaurantThemeType } from "@/lib/platform/state";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: "Authentication required" }, { status: 401 });
    }

    const staffContext = await resolveStaffContext(user);
    if (!staffContext) {
      return NextResponse.json({ message: "Staff record not found" }, { status: 403 });
    }

    const theme = getRestaurantTheme(staffContext.restaurantId);
    return NextResponse.json({ ok: true, theme });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal error" },
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
      return NextResponse.json({ message: "Authentication required" }, { status: 401 });
    }

    const staffContext = await resolveStaffContext(user);
    if (!staffContext) {
      return NextResponse.json({ message: "Staff record not found" }, { status: 403 });
    }

    const body = await req.json();
    const { theme } = body as { theme?: RestaurantThemeType };

    if (theme !== "amber" && theme !== "crimson") {
      return NextResponse.json({ message: "Invalid theme. Must be 'amber' or 'crimson'" }, { status: 400 });
    }

    const updated = setRestaurantTheme(staffContext.restaurantId, theme);
    return NextResponse.json({ ok: true, theme: updated });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
