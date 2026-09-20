import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveStaffContext } from "@/lib/auth/staff-context";
import { setOrderPrepTime, getOrderPrepTime } from "@/lib/platform/state";

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json();
    const { orderId, prepMinutes, setBy } = body as {
      orderId?: string;
      prepMinutes?: number;
      setBy?: "chef" | "waiter" | "admin";
    };

    if (!orderId || typeof prepMinutes !== "number" || prepMinutes < 0) {
      return NextResponse.json({ message: "Valid orderId and prepMinutes required" }, { status: 400 });
    }

    const roleTag = setBy || (staffContext.role === "chef" ? "chef" : "waiter");
    const estimate = setOrderPrepTime(orderId, prepMinutes, roleTag);

    return NextResponse.json({ ok: true, estimate });
  } catch (error) {
    console.error("Prep time update error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update prep time" },
      { status: 500 }
    );
  }
}
