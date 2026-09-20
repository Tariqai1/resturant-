import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getStaffPermissions } from "@/lib/platform/state";

export async function GET() {
  try {
    const admin = createAdminClient();

    // 1. Check if restaurant is specified in cookies
    const cookieStore = await cookies();
    const activeStaffCookie = cookieStore.get("od_active_staff")?.value;
    let targetRestaurantId: string | null = null;

    if (activeStaffCookie) {
      try {
        const parsed = JSON.parse(activeStaffCookie);
        targetRestaurantId = parsed.restaurant_id || null;
      } catch {
        // ignore
      }
    }

    let restaurant: { id: string; name: string } | null = null;
    if (targetRestaurantId) {
      const { data } = await admin
        .from("restaurants")
        .select("id, name")
        .eq("id", targetRestaurantId)
        .maybeSingle();
      restaurant = data;
    }

    // 2. If no cookie, resolve the restaurant that has active staff
    if (!restaurant) {
      const { data: staffWithResto } = await admin
        .from("staff_users")
        .select("restaurant_id, restaurants(id, name)")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (staffWithResto?.restaurants) {
        restaurant = Array.isArray(staffWithResto.restaurants)
          ? (staffWithResto.restaurants[0] as unknown as { id: string; name: string })
          : (staffWithResto.restaurants as unknown as { id: string; name: string });
      }
    }

    // 3. Fallback to most recently created restaurant
    if (!restaurant) {
      const { data } = await admin
        .from("restaurants")
        .select("id, name")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      restaurant = data;
    }

    if (!restaurant) {
      return NextResponse.json({ ok: false, staff: [], restaurantName: "Order Desk" });
    }

    // Fetch active staff roster for this restaurant
    const { data: staff, error } = await admin
      .from("staff_users")
      .select("id, name, role")
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      restaurantName: restaurant.name || "Order Desk",
      staff: staff || [],
    });
  } catch (error) {
    console.error("Staff roster fetch error:", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to load staff" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown-ip";

    // Rate Limiting: Max 5 attempts per IP per 5 minutes
    const rateLimitKey = `pin-auth:${ip}`;
    const rateCheck = checkRateLimit(rateLimitKey, 5, 5 * 60 * 1000);

    if (!rateCheck.allowed) {
      const minutesRemaining = Math.max(1, Math.ceil(rateCheck.resetMs / 60000));
      return NextResponse.json(
        {
          message: `Too many failed PIN attempts. Station temporarily locked for ${minutesRemaining} minutes.`,
        },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const staffId = typeof body.staffId === "string" ? body.staffId.trim() : undefined;
    const pin = String(body.pin || "").trim();

    if (!pin || pin.length !== 4) {
      return NextResponse.json({ message: "4-digit PIN is required" }, { status: 400 });
    }

    const admin = createAdminClient();

    let matchedStaff: {
      id: string;
      name: string;
      role: string;
      restaurant_id: string;
      pin_hash: string;
    } | null = null;

    if (staffId) {
      const { data: staffMember, error } = await admin
        .from("staff_users")
        .select("id, name, role, restaurant_id, pin_hash")
        .eq("id", staffId)
        .eq("is_active", true)
        .maybeSingle();

      if (error || !staffMember) {
        return NextResponse.json({ message: "Staff profile not found or inactive" }, { status: 404 });
      }

      const isMatch = await bcrypt.compare(pin, staffMember.pin_hash);
      if (isMatch) {
        matchedStaff = staffMember;
      }
    } else {
      // Must scope to active restaurant that has staff
      let targetRestoId: string | null = null;
      const cookieStore = await cookies();
      const activeStaffCookie = cookieStore.get("od_active_staff")?.value;
      if (activeStaffCookie) {
        try {
          const parsed = JSON.parse(activeStaffCookie);
          targetRestoId = parsed.restaurant_id || null;
        } catch {
          // ignore
        }
      }

      if (!targetRestoId) {
        const { data: staffWithResto } = await admin
          .from("staff_users")
          .select("restaurant_id")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        targetRestoId = staffWithResto?.restaurant_id || null;
      }

      let query = admin
        .from("staff_users")
        .select("id, name, role, restaurant_id, pin_hash")
        .eq("is_active", true);

      if (targetRestoId) {
        query = query.eq("restaurant_id", targetRestoId);
      }

      const { data: staffList, error } = await query;

      if (error || !staffList || staffList.length === 0) {
        return NextResponse.json({ message: "No active staff found for this station" }, { status: 404 });
      }

      for (const s of staffList) {
        if (await bcrypt.compare(pin, s.pin_hash)) {
          matchedStaff = s;
          break;
        }
      }
    }

    if (!matchedStaff) {
      return NextResponse.json({ message: "Incorrect PIN. Please try again." }, { status: 401 });
    }

    // Retrieve restaurant owner email to establish Supabase session
    const { data: restaurant } = await admin
      .from("restaurants")
      .select("owner_email")
      .eq("id", matchedStaff.restaurant_id)
      .single();

    if (!restaurant?.owner_email) {
      return NextResponse.json({ message: "Restaurant account configuration error" }, { status: 500 });
    }

    // Generate authenticated Supabase session using magiclink OTP
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: restaurant.owner_email,
    });

    if (linkError || !linkData.properties?.hashed_token) {
      return NextResponse.json({ message: "Session generation failed" }, { status: 500 });
    }

    const supabase = await createClient();
    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "email",
    });

    if (otpError) {
      console.error("Supabase OTP verify error:", otpError);
      return NextResponse.json({ message: "Failed to establish terminal session" }, { status: 500 });
    }

    const permissions = getStaffPermissions(matchedStaff.id, matchedStaff.role);
    const redirectPath = matchedStaff.role === "kitchen" ? "/kitchen" : "/";

    // Save active staff identity in cookie with secure attributes
    const cookieStore = await cookies();
    cookieStore.set(
      "od_active_staff",
      JSON.stringify({
        id: matchedStaff.id,
        name: matchedStaff.name,
        role: matchedStaff.role,
        restaurant_id: matchedStaff.restaurant_id,
        permissions,
      }),
      {
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      }
    );

    return NextResponse.json({
      ok: true,
      message: `Welcome, ${matchedStaff.name}!`,
      redirect: redirectPath,
      staff: {
        id: matchedStaff.id,
        name: matchedStaff.name,
        role: matchedStaff.role,
        permissions,
      },
    });
  } catch (error) {
    console.error("PIN authentication error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Authentication error" },
      { status: 500 }
    );
  }
}
