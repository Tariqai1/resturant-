import { NextRequest, NextResponse } from "next/server";
import { getRestaurantFeatures } from "@/lib/platform/state";

export type NotificationDispatchPayload = {
  type: "ORDER_APPROVAL" | "WAITER_CALL" | "TEST_ALERT";
  restaurantId: string;
  restaurantName?: string;
  tableNumber: string;
  customerName?: string;
  totalItems?: number;
  totalAmount?: number;
  callType?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as NotificationDispatchPayload;
    const { type, restaurantId, restaurantName, tableNumber, customerName, totalItems, totalAmount, callType } = body;

    if (!restaurantId || !tableNumber) {
      return NextResponse.json({ message: "restaurantId and tableNumber are required" }, { status: 400 });
    }

    const features = getRestaurantFeatures(restaurantId);

    // Build standard alert message
    let messageHeader = "";
    let messageBody = "";

    if (type === "ORDER_APPROVAL") {
      messageHeader = `⚡ *NEW ORDER AWAITING CAPTAIN APPROVAL*`;
      messageBody = `📍 *Table:* ${tableNumber}\n👤 *Guest:* ${customerName || "Dine-in Guest"}\n📦 *Items:* ${totalItems || 1}\n💰 *Total:* ₹${totalAmount || 0}\n\n👉 *Action Required:* Please review dishes on Floor Desk before dispatching to Kitchen KOT.`;
    } else if (type === "WAITER_CALL") {
      const formattedCall = (callType || "waiter").toUpperCase();
      const callEmoji =
        callType === "water" ? "💧" : callType === "bill" ? "🧾" : callType === "clean" ? "✨" : "🛎️";
      messageHeader = `${callEmoji} *TABLE BUZZER REQUEST: ${formattedCall}*`;
      messageBody = `📍 *Table:* ${tableNumber}\n🔔 *Service:* ${formattedCall}\n\n👉 *Action Required:* Please attend Table ${tableNumber} immediately.`;
    } else {
      messageHeader = `🔔 *TEST CAPTAIN ALERT*`;
      messageBody = `Test notification from ${restaurantName || "Order Desk"} Floor Management. Automated dispatch is active.`;
    }

    const fullMessage = `${messageHeader}\n${restaurantName ? `🏢 *${restaurantName}*\n` : ""}\n${messageBody}\n\n_Sent automatically via Order Desk Floor System_`;

    // Generate Click-to-Chat WhatsApp link
    const cleanPhone = (features.whatsappCaptainPhone || "").replace(/[^0-9]/g, "");
    const encodedText = encodeURIComponent(fullMessage);
    const whatsappWebUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
      : `https://api.whatsapp.com/send?text=${encodedText}`;

    let webhookStatus: "dispatched" | "skipped" | "failed" = "skipped";
    let webhookError: string | null = null;

    // If automated webhook URL is configured, trigger it asynchronously
    if (features.whatsappAlerts && features.whatsappWebhookUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const webhookRes = await fetch(features.whatsappWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            event: type,
            recipient: cleanPhone || undefined,
            message: fullMessage,
            tableNumber,
            customerName,
            totalItems,
            totalAmount,
            callType,
            timestamp: new Date().toISOString(),
          }),
        });

        clearTimeout(timeoutId);
        webhookStatus = webhookRes.ok ? "dispatched" : "failed";
      } catch (err) {
        webhookStatus = "failed";
        webhookError = err instanceof Error ? err.message : "Webhook call timeout or failed";
      }
    }

    return NextResponse.json({
      ok: true,
      type,
      tableNumber,
      whatsappWebUrl,
      webhookStatus,
      webhookError,
      message: "Notification generated successfully",
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to dispatch notification" },
      { status: 500 }
    );
  }
}
