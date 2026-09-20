import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import {
  getBroadcast,
  setBroadcast,
  clearBroadcast,
  logActivity,
  BroadcastType,
} from "@/lib/platform/state";

export async function GET() {
  const broadcast = getBroadcast();
  return NextResponse.json({
    ok: true,
    broadcast: broadcast?.active ? broadcast : null,
    fullRecord: broadcast,
  });
}

export async function POST(request: Request) {
  const authCheck = await requireSuperAdmin();
  if (!authCheck.authorized || !authCheck.user) {
    return NextResponse.json(
      { ok: false, message: authCheck.reason || "Super Admin access required" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { title, message, type, active, dismissible } = body;

    if (!title || !message) {
      return NextResponse.json(
        { ok: false, message: "Title and Message are required for broadcast" },
        { status: 400 }
      );
    }

    const updated = setBroadcast({
      title: String(title),
      message: String(message),
      type: (type as BroadcastType) || "info",
      active: active !== undefined ? Boolean(active) : true,
      dismissible: dismissible !== undefined ? Boolean(dismissible) : true,
    });

    logActivity({
      action: "BROADCAST_UPDATE",
      actorEmail: authCheck.user.email || "super-admin",
      details: `Updated Platform Broadcast Banner "${updated.title}" (${updated.type}, ${
        updated.active ? "ACTIVE" : "DISABLED"
      })`,
    });

    return NextResponse.json({
      ok: true,
      message: "Broadcast banner updated successfully",
      broadcast: updated,
    });
  } catch (error) {
    console.error("Broadcast update error:", error);
    return NextResponse.json({ ok: false, message: "Failed to update broadcast" }, { status: 500 });
  }
}

export async function DELETE() {
  const authCheck = await requireSuperAdmin();
  if (!authCheck.authorized || !authCheck.user) {
    return NextResponse.json(
      { ok: false, message: authCheck.reason || "Super Admin access required" },
      { status: 403 }
    );
  }

  clearBroadcast();

  logActivity({
    action: "BROADCAST_UPDATE",
    actorEmail: authCheck.user.email || "super-admin",
    details: "Deactivated platform-wide broadcast banner",
  });

  return NextResponse.json({
    ok: true,
    message: "Broadcast banner deactivated",
  });
}

