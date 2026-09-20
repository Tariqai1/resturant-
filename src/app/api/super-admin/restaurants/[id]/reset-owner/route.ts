import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { logActivity } from "@/lib/platform/state";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireSuperAdmin();
  if (!authCheck.authorized) {
    return NextResponse.json(
      { ok: false, message: authCheck.reason || "Unauthorized" },
      { status: 403 }
    );
  }

  const { id: restaurantId } = await context.params;
  if (!restaurantId) {
    return NextResponse.json({ ok: false, message: "Missing restaurant ID" }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const newPin = typeof body.newPin === "string" ? body.newPin.trim() : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword.trim() : "";
    const sendRecoveryEmail = Boolean(body.sendRecoveryEmail);

    const admin = createAdminClient();

    // 1. Fetch the owner of this restaurant
    const { data: owner, error: ownerErr } = await admin
      .from("staff_users")
      .select("id, name, role, auth_user_id, restaurant_id")
      .eq("restaurant_id", restaurantId)
      .eq("role", "owner")
      .maybeSingle();

    if (ownerErr || !owner) {
      return NextResponse.json(
        { ok: false, message: "Owner profile not found for this restaurant" },
        { status: 404 }
      );
    }

    const { data: restaurant } = await admin
      .from("restaurants")
      .select("owner_email, name")
      .eq("id", restaurantId)
      .single();

    const results: string[] = [];

    // 2. Update PIN if requested
    if (newPin) {
      if (!/^\d{4}$/.test(newPin)) {
        return NextResponse.json(
          { ok: false, message: "New PIN must be exactly 4 numeric digits (e.g. 1234)" },
          { status: 400 }
        );
      }

      const hashed = await bcrypt.hash(newPin, 10);
      const { error: pinErr } = await admin
        .from("staff_users")
        .update({ pin_hash: hashed, is_active: true })
        .eq("id", owner.id);

      if (pinErr) {
        return NextResponse.json({ ok: false, message: pinErr.message }, { status: 500 });
      }
      results.push(`Terminal PIN updated to ${newPin}`);
    }

    // 3. Update password directly if provided
    if (newPassword) {
      if (newPassword.length < 8) {
        return NextResponse.json(
          { ok: false, message: "Password must be at least 8 characters" },
          { status: 400 }
        );
      }

      if (owner.auth_user_id) {
        const { error: passErr } = await admin.auth.admin.updateUserById(
          owner.auth_user_id,
          { password: newPassword }
        );

        if (passErr) {
          return NextResponse.json({ ok: false, message: passErr.message }, { status: 500 });
        }
        results.push("Password updated directly");
      } else if (restaurant?.owner_email) {
        // Create user in Supabase Auth if not already linked
        const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
          email: restaurant.owner_email,
          password: newPassword,
          email_confirm: true,
        });

        if (createErr) {
          return NextResponse.json({ ok: false, message: createErr.message }, { status: 500 });
        }

        if (newUser?.user?.id) {
          await admin
            .from("staff_users")
            .update({ auth_user_id: newUser.user.id })
            .eq("id", owner.id);
        }
        results.push("Owner credentials created and password set");
      }
    }

    // 4. Send recovery link if requested
    if (sendRecoveryEmail && restaurant?.owner_email) {
      const { error: recErr } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: restaurant.owner_email,
      });

      if (recErr) {
        return NextResponse.json({ ok: false, message: recErr.message }, { status: 500 });
      }
      results.push(`Recovery link generated for ${restaurant.owner_email}`);
    }

    if (results.length > 0) {
      logActivity({
        action: "RESET_CREDENTIALS",
        actorEmail: authCheck.user?.email || "super-admin",
        targetId: restaurantId,
        targetName: restaurant?.name || "Restaurant",
        details: `Reset credentials for owner of "${restaurant?.name || "Restaurant"}" (${restaurant?.owner_email}): ${results.join(", ")}`,
      });
    }

    return NextResponse.json({
      ok: true,
      message: results.length > 0 ? results.join(", ") : "No changes specified",
    });
  } catch (error) {
    console.error("Owner reset failed:", error);
    return NextResponse.json({ ok: false, message: "Reset failed" }, { status: 500 });
  }
}
