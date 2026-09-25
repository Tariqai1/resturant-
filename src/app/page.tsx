"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import dynamic from "next/dynamic";
const ShareMenuModal = dynamic(() => import("@/components/ShareMenuModal"), { ssr: false });
import AdminNavigation from "@/components/AdminNavigation";
import type { RestaurantFeatures } from "@/lib/platform/state";
import type { SmartUpsellConfig, UpsellStrategy } from "@/lib/types/offers";
import { DEFAULT_UPSELL_CONFIG } from "@/lib/types/offers";

type DashboardTable = {
  id: string;
  table_number: string;
  status: string;
  qr_token?: string;
};

type CurrentUser = {
  id?: string;
  name: string;
  role: string;
  permissions?: {
    canEditOrders: boolean;
    canDeleteOrders: boolean;
  };
};

type Restaurant = {
  id?: string;
  name: string;
  subscription_plan?: string;
  subscription_status?: string;
};

type KitchenItem = {
  id: string;
  name: string;
  qty: number;
  category: string;
  notes?: string;
};

type KitchenTicket = {
  id: string;
  ticketNumber: string;
  tableNumber: string;
  openedAt?: string;
  status: "NEW TICKET" | "COOKING" | "PREPARING" | "SERVED";
  items: KitchenItem[];
};

type DashboardMetrics = {
  todayRevenue: number;
  dispatchedOrders: number;
  avgOrderValue: number;
  needsAttentionCount: number;
};

type BestsellerItem = {
  id: string;
  name: string;
  price: number;
  is_veg: boolean;
};

type WaiterCall = {
  id: string;
  tableId: string;
  tableNumber: string;
  restaurantId: string;
  type: "waiter" | "water" | "bill" | "clean";
  status: "active" | "acknowledged" | "resolved";
  createdAt: string;
};

type OpenOrderItem = {
  id: string;
  qty: number;
  unit_price: number;
  notes: string | null;
  item_status: string;
  menu_items?: {
    id: string;
    name: string;
    price: number;
    is_veg: boolean;
  };
};

type OpenOrder = {
  id: string;
  table_id: string;
  status: string;
  opened_at: string;
  table_session_id?: string | null;
  restaurant_tables?: {
    id: string;
    table_number: string;
  };
  order_items: OpenOrderItem[];
  prepEstimate?: {
    orderId: string;
    minutes: number;
    setAt: string;
    setBy: string;
  } | null;
};

type PendingOrderApprovalBatch = {
  id: string;
  orderId: string;
  restaurantId: string;
  tableId: string;
  tableNumber: string;
  customerName?: string | null;
  itemIds: string[];
  totalAmount: number;
  totalItems: number;
  status: "awaiting_approval" | "approved" | "rejected";
  createdAt: string;
};

export default function Home() {
  const router = useRouter();

  // State
  const [liveTables, setLiveTables] = useState<DashboardTable[] | null>(null);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [tableFilter, setTableFilter] = useState<"all" | "occupied" | "available">("all");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [theme, setTheme] = useState<"amber" | "crimson">("amber");
  const [features, setFeatures] = useState<RestaurantFeatures | null>(null);
  const [upsellConfig, setUpsellConfig] = useState<SmartUpsellConfig>(DEFAULT_UPSELL_CONFIG);
  const [isUpsellModalOpen, setIsUpsellModalOpen] = useState(false);
  const [isSavingUpsell, setIsSavingUpsell] = useState(false);
  const [upsellSaveMsg, setUpsellSaveMsg] = useState("");

  // Waiter Order Verification State
  const [pendingApprovals, setPendingApprovals] = useState<PendingOrderApprovalBatch[]>([]);
  const [selectedApprovalBatch, setSelectedApprovalBatch] = useState<PendingOrderApprovalBatch | null>(null);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [isProcessingApproval, setIsProcessingApproval] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const previousApprovalsCountRef = useRef(0);

  const [metrics, setMetrics] = useState<DashboardMetrics>({
    todayRevenue: 0,
    dispatchedOrders: 0,
    avgOrderValue: 0,
    needsAttentionCount: 0,
  });

  const [bestsellers, setBestsellers] = useState<BestsellerItem[]>([]);
  const [kitchenTickets, setKitchenTickets] = useState<KitchenTicket[]>([]);
  const [waiterCalls, setWaiterCalls] = useState<WaiterCall[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationPerm, setNotificationPerm] = useState<NotificationPermission>("default");
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());
  const [statusNotification, setStatusNotification] = useState<string | null>(null);
  const previousCallsCountRef = useRef(0);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPerm(Notification.permission);
    }
  }, []);

  const [alarmSnoozedUntil, setAlarmSnoozedUntil] = useState<number>(0);

  // Acoustic buzzer chime for table attention with optional escalation
  const playBuzzer = useCallback((isEscalated = false) => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const audioCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

      if (isEscalated) {
        // 3-Pulse Urgent Escalation Chime (1100 Hz, 1400 Hz, 1760 Hz)
        const freqs = [1100, 1400, 1760];
        freqs.forEach((freq, idx) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = "sawtooth";
          const startTime = audioCtx.currentTime + idx * 0.14;
          osc.frequency.setValueAtTime(freq, startTime);
          gain.gain.setValueAtTime(0.55, startTime);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(startTime);
          osc.stop(startTime + 0.13);
        });
      } else {
        // Standard double beep (880 Hz - A5 & 1318.5 Hz - E6)
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain1.gain.setValueAtTime(0.4, audioCtx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start();
        osc1.stop(audioCtx.currentTime + 0.2);

        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(1318.5, audioCtx.currentTime + 0.22);
        gain2.gain.setValueAtTime(0.45, audioCtx.currentTime + 0.22);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.55);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(audioCtx.currentTime + 0.22);
        osc2.stop(audioCtx.currentTime + 0.6);
      }
    } catch {
      // Audio context might be restricted
    }
  }, [soundEnabled]);

  // Persistent Repeating Audio Alarm Loop (Swiggy/Zomato Delivery-App Pattern)
  useEffect(() => {
    if (!soundEnabled) return;
    const isPersistent = features?.persistentAlarm !== false;
    if (!isPersistent) return;

    const hasPendingApprovals = pendingApprovals.length > 0;
    const hasWaiterCalls = waiterCalls.length > 0;
    if (!hasPendingApprovals && !hasWaiterCalls) return;

    const escalationLimitSec = features?.alarmEscalationSec || 90;

    const alarmInterval = setInterval(() => {
      if (Date.now() < alarmSnoozedUntil) return;

      let oldestElapsedSec = 0;
      const now = Date.now();
      for (const call of waiterCalls) {
        const sec = Math.floor((now - new Date(call.createdAt).getTime()) / 1000);
        if (sec > oldestElapsedSec) oldestElapsedSec = sec;
      }
      for (const app of pendingApprovals) {
        const sec = Math.floor((now - new Date(app.createdAt).getTime()) / 1000);
        if (sec > oldestElapsedSec) oldestElapsedSec = sec;
      }

      const isCritical = oldestElapsedSec >= escalationLimitSec;
      playBuzzer(isCritical);
    }, 15000);

    return () => clearInterval(alarmInterval);
  }, [soundEnabled, features, pendingApprovals, waiterCalls, alarmSnoozedUntil, playBuzzer]);

  const handleEnableAlerts = async () => {
    playBuzzer();
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotificationPerm(perm);
        if (perm === "granted") {
          notify("🔔 Browser alerts & buzzer audio unlocked!");
          try {
            new Notification("Floor Desk Alerts Active", {
              body: "You will receive real-time chimes and desktop popups for table calls and waiter approvals.",
              icon: "/favicon.ico",
            });
          } catch {
            // ignore
          }
        } else if (perm === "denied") {
          notify("⚠️ Browser notifications were blocked. Please enable them in your browser site permissions.");
        }
      } catch {
        // ignore
      }
    }
  };

  const handleSetOrderPrepTime = async (orderId: string, minutes: number) => {
    try {
      const res = await fetch("/api/orders/prep-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, prepMinutes: minutes, setBy: "waiter" }),
      });
      if (res.ok) {
        notify(`Cooking target set to ${minutes} mins for Table ${selectedTable}`);
        await fetchDashboardData();
      }
    } catch {
      notify("Failed to update prep time");
    }
  };

  const handleToggleTheme = async (newTheme: "amber" | "crimson") => {
    setTheme(newTheme);
    try {
      const res = await fetch("/api/restaurant/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: newTheme }),
      });
      if (res.ok) {
        notify(`Theme updated to ${newTheme === "amber" ? "Amber Gold" : "Velvet Crimson"}`);
      }
    } catch {
      // ignore
    }
  };

  const handleResolveWaiterCall = async (callId: string) => {
    try {
      const res = await fetch("/api/public/table/call-waiter", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId }),
      });
      if (res.ok) {
        setWaiterCalls((prev) => prev.filter((c) => c.id !== callId));
        notify("Table request cleared");
      }
    } catch {
      // ignore
    }
  };

  const handleWhatsAppDispatch = (
    type: "order" | "call",
    data: { tableNumber: string; customerName?: string; totalAmount?: number; totalItems?: number; callType?: string }
  ) => {
    const cleanPhone = (features?.whatsappCaptainPhone || "").replace(/[^0-9]/g, "");
    let text = "";
    if (type === "order") {
      text = `⚡ *URGENT ORDER VERIFICATION*\n📍 *Table:* ${data.tableNumber}\n👤 *Guest:* ${data.customerName || "Dine-in Guest"}\n📦 *Items:* ${data.totalItems || 1} · ₹${data.totalAmount || 0}\n\n👉 *Floor Captain:* Please review dishes on Floor Desk before firing to Kitchen KOT!`;
    } else {
      const formattedCall = (data.callType || "waiter").toUpperCase();
      text = `🛎️ *TABLE BUZZER ALERT: ${formattedCall}*\n📍 *Table:* ${data.tableNumber}\n\n👉 *Staff Attention Required Immediately!*`;
    }
    const url = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  // New Order Form & Quick POS state
  const [orderTable, setOrderTable] = useState("T01");
  const [orderGuests, setOrderGuests] = useState(2);
  const [orderSelectedItems, setOrderSelectedItems] = useState<string[]>([]);
  const [quickMenuItems, setQuickMenuItems] = useState<{ id: string; category_id?: string; name: string; price: number; is_veg: boolean }[]>([]);
  const [quickCategories, setQuickCategories] = useState<{ id: string; name: string }[]>([]);
  const [quickCategory, setQuickCategory] = useState<string>("all");
  const [quickSearch, setQuickSearch] = useState<string>("");
  const [quickCart, setQuickCart] = useState<{ [id: string]: { qty: number; notes: string; item: { id: string; category_id?: string; name: string; price: number; is_veg: boolean } } }>({});
  const [isQuickSubmitting, setIsQuickSubmitting] = useState(false);

  useEffect(() => {
    if (isNewOrderOpen && quickMenuItems.length === 0) {
      fetch("/api/menu")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.items) setQuickMenuItems(data.items);
          if (data?.categories) setQuickCategories(data.categories);
        })
        .catch(() => undefined);
    }
  }, [isNewOrderOpen, quickMenuItems.length]);

  // Table Join / Merge and Transfer state
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [mergeSourceTable, setMergeSourceTable] = useState("");
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferTargetTable, setTransferTargetTable] = useState("");
  const [isMerging, setIsMerging] = useState(false);

  const notify = useCallback((message: string) => {
    setStatusNotification(message);
    setTimeout(() => setStatusNotification(null), 3200);
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) {
        const data = await res.json();
        if (data.tables) setLiveTables(data.tables);
        if (data.openOrders) setOpenOrders(data.openOrders);
        if (data.restaurant) setRestaurant(data.restaurant);
        if (data.user) setCurrentUser(data.user);
        if (data.isSuperAdmin !== undefined) setIsSuperAdmin(data.isSuperAdmin);
        if (data.metrics) setMetrics(data.metrics);
        if (data.theme) setTheme(data.theme);
        if (data.features) setFeatures(data.features);
        if (data.upsellConfig) setUpsellConfig(data.upsellConfig);
        if (data.bestsellers) setBestsellers(data.bestsellers);
        if (data.kitchenTickets) setKitchenTickets(data.kitchenTickets);
        if (data.waiterCalls) {
          const calls: WaiterCall[] = data.waiterCalls || [];
          if (calls.length > previousCallsCountRef.current) {
            playBuzzer();
            const latestCall = calls[calls.length - 1];
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              try {
                new Notification(`🛎️ Table ${latestCall.tableNumber} Buzzer`, {
                  body: `Guest requested ${latestCall.type.toUpperCase()}. Tap to attend.`,
                  icon: "/favicon.ico",
                  tag: latestCall.id,
                });
              } catch {
                // ignore
              }
            }
          }
          previousCallsCountRef.current = calls.length;
          setWaiterCalls(calls);
        }
        if (data.pendingApprovals) {
          const approvals: PendingOrderApprovalBatch[] = data.pendingApprovals || [];
          if (approvals.length > previousApprovalsCountRef.current) {
            playBuzzer();
            const latestBatch = approvals[approvals.length - 1];
            notify(`⚡ New Order awaiting Captain Approval: Table ${latestBatch.tableNumber}`);

            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              try {
                new Notification(`⚡ Table ${latestBatch.tableNumber} Order Awaiting Verification`, {
                  body: `${latestBatch.totalItems} items · ₹${latestBatch.totalAmount} (${latestBatch.customerName || "Dine-in Guest"}). Tap to review & fire to kitchen.`,
                  icon: "/favicon.ico",
                  tag: latestBatch.id,
                });
              } catch {
                // ignore
              }
            }
          }
          previousApprovalsCountRef.current = approvals.length;
          setPendingApprovals(approvals);
        }
      }
    } catch {
      // Keep running state
    }
  }, [playBuzzer, notify]);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/dashboard")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        if (data.tables) setLiveTables(data.tables);
        if (data.openOrders) setOpenOrders(data.openOrders);
        if (data.restaurant) setRestaurant(data.restaurant);
        if (data.user) setCurrentUser(data.user);
        if (data.isSuperAdmin !== undefined) setIsSuperAdmin(data.isSuperAdmin);
        if (data.metrics) setMetrics(data.metrics);
        if (data.theme) setTheme(data.theme);
        if (data.features) setFeatures(data.features);
        if (data.upsellConfig) setUpsellConfig(data.upsellConfig);
        if (data.bestsellers) {
          setBestsellers(data.bestsellers);
          if (data.bestsellers.length > 0) {
            setOrderSelectedItems((prev) => (prev.length === 0 ? [data.bestsellers[0].id] : prev));
          }
        }
        if (data.kitchenTickets) setKitchenTickets(data.kitchenTickets);
        if (data.waiterCalls) {
          setWaiterCalls(data.waiterCalls);
          previousCallsCountRef.current = (data.waiterCalls || []).length;
        }
        if (data.pendingApprovals) {
          setPendingApprovals(data.pendingApprovals);
          previousApprovalsCountRef.current = (data.pendingApprovals || []).length;
        }
      })
      .catch(() => undefined);

    let dashboardInterval: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (dashboardInterval) clearInterval(dashboardInterval);
      dashboardInterval = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          return;
        }
        fetchDashboardData();
        setCurrentTime(Date.now());
      }, 3500);
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined") {
        if (document.visibilityState === "visible") {
          fetchDashboardData();
          setCurrentTime(Date.now());
          startPolling();
        } else if (dashboardInterval) {
          clearInterval(dashboardInterval);
          dashboardInterval = null;
        }
      }
    };

    startPolling();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      isMounted = false;
      if (dashboardInterval) clearInterval(dashboardInterval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [fetchDashboardData]);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch {
      setIsSigningOut(false);
    }
  }

  // Permissions calculation
  const userRole = currentUser?.role?.toLowerCase() || "";
  const isOwnerOrManager =
    Boolean(isSuperAdmin) ||
    ["owner", "manager", "admin"].includes(userRole);
  const canEditOrders = isOwnerOrManager || Boolean(currentUser?.permissions?.canEditOrders);
  const canDeleteOrders = isOwnerOrManager || Boolean(currentUser?.permissions?.canDeleteOrders);

  // Table calculations
  const floorTables = (liveTables && liveTables.length > 0
    ? liveTables
    : [
        { id: "1", table_number: "T01", status: "empty" },
        { id: "2", table_number: "T02", status: "empty" },
        { id: "3", table_number: "T03", status: "empty" },
        { id: "4", table_number: "T04", status: "empty" },
      ]
  ).map((t) => {
    const activeOrder = openOrders.find(
      (o) => o.table_id === t.id || o.restaurant_tables?.table_number === t.table_number
    );

    let statusLabel = "Available";
    let statusClass = "border-t-[3px] border-t-[#DCD1B7]";
    let badgeColor = "text-[#6B6153]";

    if (t.status === "served") {
      statusLabel = "Seated & Dining";
      statusClass = "border-t-[3px] border-t-[#5B7A55]";
      badgeColor = "text-[#5B7A55]";
    } else if (t.status === "preparing") {
      statusLabel = "Kitchen Cooking";
      statusClass = "border-t-[3px] border-t-[#3C5A72]";
      badgeColor = "text-[#3C5A72]";
    } else if (t.status === "pending") {
      statusLabel = "New Order Placed";
      statusClass = "border-t-[3px] border-t-[#C1652C]";
      badgeColor = "text-[#C1652C]";
    } else if (t.status === "payment_pending") {
      statusLabel = "Bill Requested";
      statusClass = "border-t-[3px] border-t-[#A8412F]";
      badgeColor = "text-[#A8412F]";
    }

    let runningTotal = 0;
    let elapsedMinutes = 0;
    let itemCount = 0;

    if (activeOrder && activeOrder.order_items) {
      runningTotal = activeOrder.order_items.reduce((sum, it) => {
        const rate = Number(it.unit_price) || Number(it.menu_items?.price) || 0;
        return sum + Number(it.qty) * rate;
      }, 0);
      itemCount = activeOrder.order_items.reduce((sum, it) => sum + it.qty, 0);
      elapsedMinutes = Math.max(
        0,
        Math.floor((currentTime - new Date(activeOrder.opened_at).getTime()) / 60000)
      );
    }

    let joinedBadge: string | null = null;
    const sessionStr = activeOrder?.table_session_id || "";
    if (sessionStr.startsWith("joined:")) {
      const extraJoined = sessionStr
        .replace("joined:", "")
        .split(",")
        .map((n: string) => n.trim())
        .filter((n: string) => n !== t.table_number);
      if (extraJoined.length > 0) {
        joinedBadge = `🔗 +${extraJoined.join("+")}`;
      }
    } else if (sessionStr.startsWith("merged_into:")) {
      const masterNum = sessionStr.replace("merged_into:", "").trim();
      joinedBadge = `🔗 Joined ${masterNum}`;
    }

    const hasPendingApproval = pendingApprovals.some(
      (b) => b.tableNumber === t.table_number || b.tableId === t.id
    );

    return {
      id: t.id,
      number: t.table_number,
      statusLabel,
      statusClass,
      badgeColor,
      isOccupied: t.status !== "empty",
      runningTotal,
      itemCount,
      elapsedMinutes,
      joinedBadge,
      hasPendingApproval,
    };
  });

  const filteredTables = floorTables.filter((t) => {
    if (tableFilter === "occupied") return t.isOccupied;
    if (tableFilter === "available") return !t.isOccupied;
    return true;
  });

  const occupiedCount = floorTables.filter((t) => t.isOccupied).length;
  const activeRestaurantName = restaurant?.name || "Order Desk";

  // Item quantity update on active chit
  async function handleUpdateItemQty(itemId: string, qty: number) {
    try {
      const res = await fetch("/api/orders/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_qty", itemId, qty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update item quantity");
      notify(data.message || "Order updated");
      await fetchDashboardData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Update failed");
    }
  }

  // Remove single item
  async function handleRemoveItem(itemId: string) {
    try {
      const res = await fetch("/api/orders/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_item", itemId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to remove item");
      notify(data.message || "Item removed");
      await fetchDashboardData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Remove failed");
    }
  }

  // Void active table order
  async function handleVoidOrder(orderId: string, tableNum: string) {
    if (!confirm(`Are you sure you want to void the order for Table ${tableNum}? This will free the table.`)) {
      return;
    }
    try {
      const res = await fetch("/api/orders/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "void_order", orderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to void order");
      notify(data.message || "Order voided and table freed");
      setSelectedTable(null);
      await fetchDashboardData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Void failed");
    }
  }

  // Settle bill
  async function handleSettleTable(tableNum: string, tableId?: string, orderId?: string) {
    if (isSettling) return;
    setIsSettling(true);
    try {
      const res = await fetch("/api/bills/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNumber: tableNum, tableId, orderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to settle bill");
      notify(`Table ${tableNum} bill settled and table marked free`);
      setSelectedTable(null);
      await fetchDashboardData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Settlement failed");
    } finally {
      setIsSettling(false);
    }
  }

  // Join / Merge 2 tables together into a single combined order
  async function handleMergeTables() {
    if (!selectedTable || !mergeSourceTable || mergeSourceTable === selectedTable) return;
    setIsMerging(true);
    try {
      const res = await fetch("/api/orders/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merge_tables",
          sourceTableNumber: mergeSourceTable,
          targetTableNumber: selectedTable,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to merge tables");
      notify(data.message || `Table ${mergeSourceTable} joined with Table ${selectedTable}`);
      setIsMergeOpen(false);
      setMergeSourceTable("");
      await fetchDashboardData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setIsMerging(false);
    }
  }

  // Shift running order to another table
  async function handleTransferTable() {
    if (!selectedTable || !transferTargetTable || transferTargetTable === selectedTable) return;
    setIsMerging(true);
    try {
      const res = await fetch("/api/orders/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "transfer_table",
          currentTableNumber: selectedTable,
          newTableNumber: transferTargetTable,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to transfer table");
      notify(data.message || `Table ${selectedTable} transferred to Table ${transferTargetTable}`);
      setSelectedTable(transferTargetTable);
      setIsTransferOpen(false);
      setTransferTargetTable("");
      await fetchDashboardData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setIsMerging(false);
    }
  }

  // Quick Dispatch Order from POS
  async function handleCreateOrderSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cartEntries = Object.values(quickCart).filter((c) => c.qty > 0);
    
    // Support either cart entries or fallback to selected items
    const itemsToSubmit = cartEntries.length > 0
      ? cartEntries.map((c) => ({ itemId: c.item.id, qty: c.qty, notes: c.notes || undefined }))
      : orderSelectedItems.map((id) => ({ itemId: id, qty: 1 }));

    if (!orderTable || itemsToSubmit.length === 0) {
      notify("Select a table and add at least 1 dish to order");
      return;
    }

    setIsQuickSubmitting(true);
    try {
      const res = await fetch("/api/orders/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableNumber: orderTable,
          guestCount: orderGuests,
          items: itemsToSubmit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to dispatch order");
      notify(`KOT dispatched to kitchen for Table ${orderTable} (${itemsToSubmit.length} items)`);
      setIsNewOrderOpen(false);
      setQuickCart({});
      setOrderSelectedItems([]);
      await fetchDashboardData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Order creation failed");
    } finally {
      setIsQuickSubmitting(false);
    }
  }

  // Handle Waiter / Captain Order Approval
  const handleApproveBatch = async (batchId: string) => {
    if (isProcessingApproval) return;
    setIsProcessingApproval(true);
    try {
      const res = await fetch("/api/orders/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, action: "approve" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to approve order");
      notify(data.message || "Order approved and dispatched to Kitchen KOT");
      setIsApprovalModalOpen(false);
      setSelectedApprovalBatch(null);
      setShowRejectInput(false);
      await fetchDashboardData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setIsProcessingApproval(false);
    }
  };

  // Handle Waiter / Captain Order Rejection
  const handleRejectBatch = async (batchId: string, reason?: string) => {
    if (isProcessingApproval) return;
    setIsProcessingApproval(true);
    try {
      const res = await fetch("/api/orders/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, action: "reject", reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to reject order");
      notify(data.message || "Order rejected and discarded");
      setIsApprovalModalOpen(false);
      setSelectedApprovalBatch(null);
      setShowRejectInput(false);
      setRejectionReason("");
      await fetchDashboardData();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setIsProcessingApproval(false);
    }
  };

  return (
    <div data-theme={theme} className="min-h-screen flex flex-col md:flex-row" style={{ backgroundColor: "var(--paper)" }}>
      {/* State Notification Banner (Replaces floating toast) */}
      {statusNotification && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-2.5 rounded shadow text-xs font-semibold"
          style={{
            backgroundColor: "var(--dark-surface)",
            color: "var(--paper)",
            border: "1px solid var(--hairline)",
          }}
        >
          {statusNotification}
        </div>
      )}

      {/* Universal Responsive Navigation (Desktop Sidebar / Mobile Top & Bottom Bar) */}
      <AdminNavigation
        currentTab="floor"
        restaurantName={activeRestaurantName}
        currentUser={currentUser}
        occupiedTablesCount={occupiedCount}
        totalTablesCount={floorTables.length}
        pendingKitchenCount={kitchenTickets.filter((t) => t.status !== "SERVED").length}
        isSuperAdmin={isSuperAdmin}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onSignOut={handleSignOut}
        mobileNavStyle={features?.mobileNavStyle || "bottom_bar"}
      />

      {/* Main Floor Workspace */}
      <main className="flex-1 p-4 sm:p-5 md:p-8 overflow-y-auto space-y-6 pb-24 md:pb-8" style={{ backgroundColor: "var(--paper)" }}>
        {/* Top Operational Bar */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-dashed" style={{ borderColor: "var(--hairline)" }}>
          <div>
            <h2 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
              Floor Overview
            </h2>
            <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
              Live service status for {activeRestaurantName}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio Buzzer & Push Notification Unlock Button */}
            <button
              type="button"
              onClick={notificationPerm !== "granted" ? handleEnableAlerts : () => setSoundEnabled(!soundEnabled)}
              className="px-3 py-2 rounded text-xs font-semibold border cursor-pointer flex items-center gap-1.5 transition-colors"
              style={{
                backgroundColor: notificationPerm === "granted" && soundEnabled ? "var(--paper-dim)" : "#FFFBEB",
                borderColor: notificationPerm === "granted" && soundEnabled ? "var(--hairline)" : "#FCD34D",
                color: notificationPerm === "granted" && soundEnabled ? "var(--ink)" : "#B45309",
              }}
              title={
                notificationPerm !== "granted"
                  ? "Click to enable popup notifications and buzzer audio"
                  : soundEnabled
                  ? "Buzzer active"
                  : "Buzzer muted"
              }
            >
              <span>{notificationPerm !== "granted" ? "⚡" : soundEnabled ? "🔔" : "🔕"}</span>
              <span className="hidden sm:inline">
                {notificationPerm !== "granted"
                  ? "Enable Alerts"
                  : soundEnabled
                  ? "Alerts Active"
                  : "Alerts Muted"}
              </span>
            </button>

            {/* Owner & Manager Controls Only */}
            {isOwnerOrManager && (
              <>
                <button
                  type="button"
                  onClick={() => setIsShareMenuOpen(true)}
                  className="px-3 py-2 rounded text-xs font-bold border cursor-pointer flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                  style={{
                    backgroundColor: "#E8F5E9",
                    color: "#1B5E20",
                    borderColor: "#A5D6A7",
                    borderRadius: "5px",
                  }}
                  title="Share Customer Digital Menu Link & QR"
                >
                  <span>📤</span>
                  <span className="hidden sm:inline">Share Menu</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsUpsellModalOpen(true)}
                  className="px-3 py-2 rounded text-xs font-bold border cursor-pointer flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                  style={{
                    backgroundColor: upsellConfig.enabled ? "#FFF8E1" : "#F5F5F5",
                    color: upsellConfig.enabled ? "#B78103" : "#757575",
                    borderColor: upsellConfig.enabled ? "#FFE082" : "#E0E0E0",
                    borderRadius: "5px",
                  }}
                  title="Configure Smart Upsell & Basket Pairing"
                >
                  <span>💡</span>
                  <span className="hidden sm:inline">Smart Upsell</span>
                  {upsellConfig.ownerCanManageUpsell === false && <span className="text-[10px]">🔒</span>}
                </button>

                {/* Captain Verification Toggle */}
                <button
                  type="button"
                  onClick={async () => {
                    const current = Boolean(features?.waiterOrderApproval);
                    const next = !current;
                    try {
                      const res = await fetch("/api/restaurant/features", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ waiterOrderApproval: next }),
                      });
                      if (res.ok) {
                        setFeatures((prev) => (prev ? { ...prev, waiterOrderApproval: next } : null));
                        notify(next ? "Waiter Order Verification Enabled" : "Direct Kitchen KOT Enabled (Verification Disabled)");
                      }
                    } catch {
                      // ignore
                    }
                  }}
                  className="px-3 py-2 rounded text-xs font-bold border cursor-pointer flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                  style={{
                    backgroundColor: features?.waiterOrderApproval ? "#FFF8E1" : "#F5F5F5",
                    color: features?.waiterOrderApproval ? "#B78103" : "#757575",
                    borderColor: features?.waiterOrderApproval ? "#FFE082" : "#E0E0E0",
                    borderRadius: "5px",
                  }}
                  title="Toggle Waiter / Captain Order Verification before Kitchen Dispatch"
                >
                  <span>👨‍💼</span>
                  <span className="hidden sm:inline">Captain Verification: {features?.waiterOrderApproval ? "ON" : "OFF"}</span>
                </button>

                {/* Live Order Journey UX Layout Switcher */}
                <button
                  type="button"
                  onClick={async () => {
                    const current = features?.orderJourneyLayout || "floating_capsule";
                    const next =
                      current === "floating_capsule"
                        ? "split_card"
                        : current === "split_card"
                        ? "slim_accordion"
                        : "floating_capsule";
                    try {
                      const res = await fetch("/api/restaurant/features", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ orderJourneyLayout: next }),
                      });
                      if (res.ok) {
                        setFeatures((prev) => (prev ? { ...prev, orderJourneyLayout: next } : null));
                        notify(
                          next === "floating_capsule"
                            ? "Customer Journey: Floating Capsule + Bottom Sheet Active"
                            : next === "split_card"
                            ? "Customer Journey: Side-by-Side Split Card Active"
                            : "Customer Journey: Ultra-Slim Accordion Active"
                        );
                      }
                    } catch {
                      // ignore
                    }
                  }}
                  className="px-3 py-2 rounded text-xs font-bold border cursor-pointer flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                  style={{
                    backgroundColor: "#FAF5FF",
                    color: "#6B21A8",
                    borderColor: "#E9D5FF",
                    borderRadius: "5px",
                  }}
                  title="Cycle Customer Table Live Order Journey Layout (Floating Capsule / Side Split / Slim Accordion)"
                >
                  <span>🗺️</span>
                  <span className="hidden lg:inline">Journey:</span>
                  <span className="font-bold">
                    {(features?.orderJourneyLayout || "floating_capsule") === "floating_capsule"
                      ? "Floating Sheet"
                      : (features?.orderJourneyLayout || "floating_capsule") === "split_card"
                      ? "Side Split"
                      : "Slim Accordion"}
                  </span>
                </button>
              </>
            )}

            <button
              onClick={() => {
                setOrderTable(floorTables[0]?.number || "T01");
                setIsNewOrderOpen(true);
              }}
              className="px-4 py-2 rounded text-xs font-bold cursor-pointer shadow-sm transition-transform active:scale-95"
              style={{ backgroundColor: "var(--rust)", color: "var(--rust-text)", borderRadius: "5px" }}
            >
              + New order
            </button>
          </div>
        </header>

        {/* Critical Escalation Banner (Delivery-App Emergency Alert) */}
        {(() => {
          const escalationLimitSec = features?.alarmEscalationSec || 90;
          const hasEscalatedCall = waiterCalls.some(
            (c) => Math.floor((currentTime - new Date(c.createdAt).getTime()) / 1000) >= escalationLimitSec
          );
          const hasEscalatedApproval = pendingApprovals.some(
            (b) => Math.floor((currentTime - new Date(b.createdAt).getTime()) / 1000) >= escalationLimitSec
          );
          const isEmergency = hasEscalatedCall || hasEscalatedApproval;

          if (!isEmergency) return null;

          return (
            <div className="p-3.5 bg-red-600 text-white rounded-lg shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-pulse border-2 border-red-700">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🚨</span>
                <div>
                  <div className="font-heading font-black text-sm tracking-wide uppercase">
                    Critical Escalation: Table Awaiting Service (&gt; {escalationLimitSec}s)
                  </div>
                  <div className="text-xs text-red-100">
                    One or more tables have exceeded the maximum service wait time. Floor Captain / Manager attention required immediately!
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setAlarmSnoozedUntil(Date.now() + 120000);
                    notify("Alarm silenced for 2 minutes");
                  }}
                  className="px-3 py-1.5 bg-white text-red-700 text-xs font-bold rounded shadow-sm hover:bg-red-50 cursor-pointer"
                >
                  🔕 Silence Alarm (2m)
                </button>
              </div>
            </div>
          );
        })()}

        {/* ACTIVE TABLE BUZZER ALERTS (Call Waiter / Water / Bill) */}
        {waiterCalls.length > 0 && (
          <div
            className="p-4 rounded border-2 border-dashed space-y-3"
            style={{
              backgroundColor: "#FFF8F0",
              borderColor: "var(--rust)",
              borderRadius: "6px",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="animate-bounce text-base">🛎️</span>
                <span className="font-heading text-sm font-bold tracking-wide" style={{ color: "var(--rust)" }}>
                  {waiterCalls.length} ACTIVE TABLE BUZZER{waiterCalls.length > 1 ? "S" : ""}
                </span>
                {features?.persistentAlarm !== false && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-100 text-orange-800 font-bold hidden sm:inline">
                    🚨 Alarm Loop: 15s Pulse
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {features?.persistentAlarm !== false && (
                  <button
                    type="button"
                    onClick={() => {
                      if (Date.now() < alarmSnoozedUntil) {
                        setAlarmSnoozedUntil(0);
                        notify("Alarm loop resumed");
                      } else {
                        setAlarmSnoozedUntil(Date.now() + 120000);
                        notify("Alarm silenced for 2 minutes");
                      }
                    }}
                    className="px-2.5 py-1 text-[11px] font-bold rounded border cursor-pointer transition-colors"
                    style={{
                      backgroundColor: Date.now() < alarmSnoozedUntil ? "#F5F5F5" : "#FFFFFF",
                      borderColor: "var(--hairline)",
                      color: Date.now() < alarmSnoozedUntil ? "#757575" : "var(--rust)",
                    }}
                  >
                    {Date.now() < alarmSnoozedUntil ? "🔔 Resume Sound" : "🔕 Snooze Alarm (2m)"}
                  </button>
                )}
                <span className="text-[11px] font-medium hidden md:inline" style={{ color: "var(--ink-soft)" }}>
                  Tap &apos;Attended&apos; once staff reaches table
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {waiterCalls.map((call) => {
                const callLabel =
                  call.type === "water"
                    ? "Needs Water"
                    : call.type === "bill"
                    ? "Bill Requested"
                    : call.type === "clean"
                    ? "Clear Table"
                    : "Call Captain";
                const callIcon =
                  call.type === "water"
                    ? "💧"
                    : call.type === "bill"
                    ? "🧾"
                    : call.type === "clean"
                    ? "✨"
                    : "🛎️";
                const elapsedSec = Math.max(
                  0,
                  Math.floor((currentTime - new Date(call.createdAt).getTime()) / 1000)
                );
                const elapsedText =
                  elapsedSec < 60
                    ? `${elapsedSec}s ago`
                    : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s ago`;
                const escalationLimitSec = features?.alarmEscalationSec || 90;
                const isEscalated = elapsedSec >= escalationLimitSec;
                const isElevated = elapsedSec >= 60 && !isEscalated;

                return (
                  <div
                    key={call.id}
                    className={`p-3 rounded border flex items-center justify-between gap-3 shadow-sm bg-white transition-all ${
                      isEscalated
                        ? "border-red-500 bg-red-50/50 shadow-md ring-1 ring-red-400"
                        : isElevated
                        ? "border-amber-400 bg-amber-50/30"
                        : ""
                    }`}
                    style={{
                      borderColor: isEscalated ? "#EF4444" : isElevated ? "#F59E0B" : "var(--hairline)",
                      borderLeft: `4px solid ${isEscalated ? "#DC2626" : isElevated ? "#D97706" : "var(--rust)"}`,
                    }}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{callIcon}</span>
                        <span className="font-heading text-base font-bold" style={{ color: "var(--ink)" }}>
                          Table {call.tableNumber}
                        </span>
                      </div>
                      <div className="text-xs font-semibold mt-0.5" style={{ color: isEscalated ? "#DC2626" : "var(--rust)" }}>
                        {callLabel}
                      </div>
                      <div className="mt-1">
                        {isEscalated ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 animate-pulse">
                            ⚠️ Escalated ({elapsedText})
                          </span>
                        ) : isElevated ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            ⏳ Warning ({elapsedText})
                          </span>
                        ) : (
                          <span className="text-[10px]" style={{ color: "var(--ink-soft)" }}>
                            {elapsedText}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* 1-Tap WhatsApp Forward Button */}
                      <button
                        type="button"
                        onClick={() =>
                          handleWhatsAppDispatch("call", {
                            tableNumber: call.tableNumber,
                            callType: call.type,
                          })
                        }
                        className="px-2 py-1.5 rounded text-[11px] font-bold border border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 cursor-pointer active:scale-95 transition-all shadow-2xs"
                        title="Alert Captain / Floor Group on WhatsApp"
                      >
                        💬 WhatsApp
                      </button>

                      <button
                        type="button"
                        onClick={() => handleResolveWaiterCall(call.id)}
                        className="px-3 py-1.5 rounded text-xs font-bold text-white cursor-pointer transition-transform active:scale-95 shadow-2xs"
                        style={{
                          backgroundColor: "var(--sage)",
                          borderRadius: "4px",
                        }}
                      >
                        Attended ✓
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ACTIVE ORDER APPROVAL ALERTS (Captain Verification Required) */}
        {pendingApprovals.length > 0 && (
          <div
            className="p-4 rounded border-2 border-dashed space-y-3"
            style={{
              backgroundColor: "#FFFBEB",
              borderColor: "#F59E0B",
              borderRadius: "6px",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="animate-pulse text-base">👨‍💼</span>
                <span className="font-heading text-sm font-bold tracking-wide text-amber-900">
                  {pendingApprovals.length} ORDER{pendingApprovals.length > 1 ? "S" : ""} AWAITING CAPTAIN VERIFICATION
                </span>
                {features?.persistentAlarm !== false && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-200 text-amber-900 font-bold hidden sm:inline">
                    🚨 Alarm Loop Active
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {features?.persistentAlarm !== false && (
                  <button
                    type="button"
                    onClick={() => {
                      if (Date.now() < alarmSnoozedUntil) {
                        setAlarmSnoozedUntil(0);
                        notify("Alarm loop resumed");
                      } else {
                        setAlarmSnoozedUntil(Date.now() + 120000);
                        notify("Alarm silenced for 2 minutes");
                      }
                    }}
                    className="px-2.5 py-1 text-[11px] font-bold rounded border border-amber-300 bg-white text-amber-900 cursor-pointer hover:bg-amber-50"
                  >
                    {Date.now() < alarmSnoozedUntil ? "🔔 Resume Sound" : "🔕 Snooze Alarm (2m)"}
                  </button>
                )}
                <span className="text-[11px] font-medium text-amber-800 hidden md:inline">
                  Verify guest items before firing to kitchen KOT
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {pendingApprovals.map((batch) => {
                const elapsedSec = Math.max(
                  0,
                  Math.floor((currentTime - new Date(batch.createdAt).getTime()) / 1000)
                );
                const elapsedText =
                  elapsedSec < 60
                    ? `${elapsedSec}s ago`
                    : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s ago`;
                const escalationLimitSec = features?.alarmEscalationSec || 90;
                const isEscalated = elapsedSec >= escalationLimitSec;
                const isElevated = elapsedSec >= 60 && !isEscalated;

                return (
                  <div
                    key={batch.id}
                    className={`p-3 bg-white rounded border shadow-xs flex items-center justify-between gap-3 transition-all ${
                      isEscalated
                        ? "border-red-500 bg-red-50/50 shadow-md ring-1 ring-red-400"
                        : isElevated
                        ? "border-amber-400 bg-amber-50/30"
                        : "border-amber-200"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-black text-sm text-stone-900">
                          Table {batch.tableNumber}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                          {batch.totalItems} item{batch.totalItems > 1 ? "s" : ""} · ₹{batch.totalAmount}
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-500 mt-0.5">
                        Guest: <span className="font-medium text-stone-700">{batch.customerName || "Dine-in Guest"}</span>
                      </div>
                      <div className="mt-1">
                        {isEscalated ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 animate-pulse">
                            ⚠️ Escalated ({elapsedText})
                          </span>
                        ) : isElevated ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            ⏳ Warning ({elapsedText})
                          </span>
                        ) : (
                          <span className="text-[10px] text-stone-500">{elapsedText}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* 1-Tap WhatsApp Forward Button */}
                      <button
                        type="button"
                        onClick={() =>
                          handleWhatsAppDispatch("order", {
                            tableNumber: batch.tableNumber,
                            customerName: batch.customerName || undefined,
                            totalItems: batch.totalItems,
                            totalAmount: batch.totalAmount,
                          })
                        }
                        className="px-2 py-1.5 rounded text-[11px] font-bold border border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 cursor-pointer active:scale-95 transition-all shadow-2xs"
                        title="Forward Order to Captain on WhatsApp"
                      >
                        💬 WhatsApp
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedApprovalBatch(batch);
                          setIsApprovalModalOpen(true);
                        }}
                        className="px-2.5 py-1.5 text-xs font-bold rounded bg-amber-500 text-white cursor-pointer hover:bg-amber-600 active:scale-95 transition-all shadow-xs"
                      >
                        Review
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Metrics Section: Executive Revenue for Owners/Managers, Operational Service Stats for Waiters */}
        {isOwnerOrManager ? (
          <section className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-stretch">
            {/* Dominant Hero Metric: Today's Revenue */}
            <div
              className="lg:col-span-2 p-5 rounded"
              style={{
                backgroundColor: "var(--paper)",
                border: "1.5px solid var(--hairline)",
                boxShadow: "var(--shadow-md)",
              }}
            >
              <div className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>
                Today&apos;s revenue
              </div>
              <div className="font-heading text-4xl font-bold mt-1" style={{ color: "var(--rust)" }}>
                ₹{metrics.todayRevenue.toLocaleString("en-IN")}
              </div>
              <div className="text-xs mt-2 font-medium" style={{ color: "var(--sage)" }}>
                Gross settled sales for the current shift
              </div>
            </div>

            {/* Grouped Secondary Operational Stats */}
            <div
              className="lg:col-span-2 p-5 rounded flex flex-col justify-between"
              style={{
                backgroundColor: "var(--paper-dim)",
                border: "1px solid var(--hairline)",
              }}
            >
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    Dispatched
                  </div>
                  <div className="font-heading text-2xl font-bold mt-0.5" style={{ color: "var(--ink)" }}>
                    {metrics.dispatchedOrders}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
                    orders today
                  </div>
                </div>

                <div>
                  <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    Average bill
                  </div>
                  <div className="font-heading text-2xl font-bold mt-0.5" style={{ color: "var(--ink)" }}>
                    ₹{metrics.avgOrderValue}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
                    per order
                  </div>
                </div>

                <div>
                  <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    Attention
                  </div>
                  <div
                    className="font-heading text-2xl font-bold mt-0.5"
                    style={{ color: metrics.needsAttentionCount > 0 ? "var(--brick)" : "var(--sage)" }}
                  >
                    {metrics.needsAttentionCount}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
                    tables waiting
                  </div>
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-dashed text-xs" style={{ borderColor: "var(--hairline)", color: "var(--ink-soft)" }}>
                {occupiedCount} of {floorTables.length} tables currently seated
              </div>
            </div>
          </section>
        ) : (
          /* Operational Service Stat Cards for Captains & Waiters */
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div
              className="p-4 rounded border"
              style={{ backgroundColor: "var(--paper)", borderColor: "var(--hairline)" }}
            >
              <div className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Seated Tables</div>
              <div className="font-heading text-2xl font-bold mt-1" style={{ color: "var(--ink)" }}>
                {occupiedCount} <span className="text-sm font-normal text-stone-400">/ {floorTables.length}</span>
              </div>
              <div className="text-[11px] mt-1 text-stone-500">Active dining tables</div>
            </div>

            <div
              className="p-4 rounded border"
              style={{ backgroundColor: "var(--paper)", borderColor: "var(--hairline)" }}
            >
              <div className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Pending Approvals</div>
              <div className={`font-heading text-2xl font-bold mt-1 ${pendingApprovals.length > 0 ? "text-amber-600 animate-pulse" : "text-stone-700"}`}>
                {pendingApprovals.length}
              </div>
              <div className="text-[11px] mt-1 text-stone-500">Awaiting verification</div>
            </div>

            <div
              className="p-4 rounded border"
              style={{ backgroundColor: "var(--paper)", borderColor: "var(--hairline)" }}
            >
              <div className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Cooking in Kitchen</div>
              <div className="font-heading text-2xl font-bold mt-1 text-sky-700">
                {kitchenTickets.filter((t) => t.status !== "SERVED").length}
              </div>
              <div className="text-[11px] mt-1 text-stone-500">Active kitchen KOTs</div>
            </div>

            <div
              className="p-4 rounded border"
              style={{ backgroundColor: "var(--paper)", borderColor: "var(--hairline)" }}
            >
              <div className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Table Buzzers</div>
              <div className={`font-heading text-2xl font-bold mt-1 ${waiterCalls.length > 0 ? "text-red-600 animate-bounce" : "text-emerald-600"}`}>
                {waiterCalls.length}
              </div>
              <div className="text-[11px] mt-1 text-stone-500">Guest requests</div>
            </div>
          </section>
        )}

        {/* Floor Tables Grid Section */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-heading text-lg font-bold" style={{ color: "var(--ink)" }}>
              Table Stations
            </h3>

            {/* Status Filter */}
            <div className="flex gap-1 bg-stone-200/50 p-1 rounded border" style={{ borderColor: "var(--hairline)" }}>
              <button
                type="button"
                onClick={() => setTableFilter("all")}
                className="px-2.5 py-1 text-xs font-semibold rounded cursor-pointer transition-colors"
                style={{
                  backgroundColor: tableFilter === "all" ? "var(--paper)" : "transparent",
                  color: tableFilter === "all" ? "var(--ink)" : "var(--ink-soft)",
                  border: tableFilter === "all" ? "1px solid var(--hairline)" : "1px solid transparent",
                }}
              >
                All tables ({floorTables.length})
              </button>
              <button
                type="button"
                onClick={() => setTableFilter("occupied")}
                className="px-2.5 py-1 text-xs font-semibold rounded cursor-pointer transition-colors"
                style={{
                  backgroundColor: tableFilter === "occupied" ? "var(--paper)" : "transparent",
                  color: tableFilter === "occupied" ? "var(--rust)" : "var(--ink-soft)",
                  border: tableFilter === "occupied" ? "1px solid var(--hairline)" : "1px solid transparent",
                }}
              >
                Seated ({occupiedCount})
              </button>
              <button
                type="button"
                onClick={() => setTableFilter("available")}
                className="px-2.5 py-1 text-xs font-semibold rounded cursor-pointer transition-colors"
                style={{
                  backgroundColor: tableFilter === "available" ? "var(--paper)" : "transparent",
                  color: tableFilter === "available" ? "var(--sage)" : "var(--ink-soft)",
                  border: tableFilter === "available" ? "1px solid var(--hairline)" : "1px solid transparent",
                }}
              >
                Available ({floorTables.length - occupiedCount})
              </button>
            </div>
          </div>

          {/* Grid of Table Chits */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredTables.map((table) => (
              <button
                key={table.id}
                type="button"
                onClick={() => setSelectedTable(table.number)}
                className={`p-3.5 rounded text-left transition-all cursor-pointer ${table.statusClass}`}
                style={{
                  backgroundColor: "var(--paper)",
                  borderRight: "1px solid var(--hairline)",
                  borderBottom: "1px solid var(--hairline)",
                  borderLeft: "1px solid var(--hairline)",
                  borderRadius: "3px",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div className="flex items-baseline justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-heading text-xl font-bold" style={{ color: "var(--ink)" }}>
                      {table.number}
                    </span>
                    {table.joinedBadge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        {table.joinedBadge}
                      </span>
                    )}
                    {table.hasPendingApproval && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-black bg-amber-500 text-white animate-pulse shadow-xs">
                        ⏳ Approval
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold" style={{ color: table.badgeColor }}>
                    {table.statusLabel}
                  </span>
                </div>

                <div className="mt-3 pt-2 border-t border-dashed flex items-baseline justify-between" style={{ borderColor: "var(--hairline)" }}>
                  <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    {table.isOccupied ? `${table.itemCount} items · ${table.elapsedMinutes}m` : "Ready for guests"}
                  </span>
                  <span className="font-receipt text-xs font-semibold" style={{ color: "var(--ink)" }}>
                    {table.isOccupied ? `₹${table.runningTotal.toLocaleString("en-IN")}` : "Free"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Real Kitchen Rail Perforated Ticket Motif */}
        <section className="space-y-3 pt-4 border-t border-dashed" style={{ borderColor: "var(--hairline)" }}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-heading text-lg font-bold" style={{ color: "var(--ink)" }}>
                Active Kitchen Rail
              </h3>
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                Live order slips cooking on the floor
              </p>
            </div>

            <Link
              href="/kitchen"
              className="text-xs font-semibold px-2.5 py-1.5 rounded"
              style={{
                backgroundColor: "var(--paper-dim)",
                border: "1px solid var(--hairline)",
                color: "var(--rust)",
              }}
            >
              Open kitchen display
            </Link>
          </div>

          {kitchenTickets.length === 0 ? (
            <div
              className="p-8 rounded text-center"
              style={{
                backgroundColor: "var(--paper-dim)",
                border: "1px dashed var(--hairline)",
                color: "var(--ink-soft)",
              }}
            >
              <p className="text-xs font-medium">All kitchen slips have been cleared. Standing by for orders.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {kitchenTickets.map((ticket) => {
                const isReady = ticket.status === "SERVED";
                return (
                  <div
                    key={ticket.id}
                    className="p-4 rounded flex flex-col justify-between"
                    style={{
                      backgroundColor: "var(--paper)",
                      border: "1px solid var(--hairline)",
                      borderTop: isReady ? "3px solid var(--sage)" : "3px solid var(--rust)",
                      borderRadius: "3px",
                      boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    <div>
                      {/* Ticket Header Slip */}
                      <div className="flex items-baseline justify-between pb-2 border-b border-dashed" style={{ borderColor: "var(--hairline)" }}>
                        <div>
                          <span className="font-heading text-lg font-bold" style={{ color: "var(--ink)" }}>
                            Table {ticket.tableNumber}
                          </span>
                        </div>
                        <span className="font-receipt text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
                          {ticket.ticketNumber}
                        </span>
                      </div>

                      {/* Items Line Items in Monospace for Genuine Kitchen Printer Look */}
                      <div className="py-2.5 space-y-1 font-receipt text-xs">
                        {ticket.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-baseline" style={{ color: "var(--ink)" }}>
                            <span>
                              {item.qty}× {item.name}
                            </span>
                            <span className="text-[10px] text-stone-500 uppercase">{item.category}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-dashed flex items-center justify-between" style={{ borderColor: "var(--hairline)" }}>
                      <span
                        className="text-[11px] font-semibold"
                        style={{ color: isReady ? "var(--sage)" : "var(--rust)" }}
                      >
                        {isReady ? "Ready to serve" : "Cooking in kitchen"}
                      </span>
                      <span className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
                        {ticket.items.length} item(s)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Slide-out Order Detail Chit Drawer */}
      {selectedTable && (() => {
        const activeTableObj = liveTables?.find((t) => t.table_number === selectedTable);
        const activeOrder = openOrders.find(
          (o) =>
            o.restaurant_tables?.table_number === selectedTable ||
            (activeTableObj && o.table_id === activeTableObj.id)
        );

        const chitItems = activeOrder?.order_items || [];
        const subtotal = chitItems.reduce((sum, it) => {
          const rate = Number(it.unit_price) || Number(it.menu_items?.price) || 0;
          return sum + Number(it.qty) * rate;
        }, 0);
        // Realistic Indian GST: 2.5% CGST + 2.5% SGST = 5%
        const cgst = Math.round(subtotal * 0.025 * 100) / 100;
        const sgst = Math.round(subtotal * 0.025 * 100) / 100;
        const grandTotal = Math.round(subtotal + cgst + sgst);

        const elapsed = activeOrder
          ? Math.max(0, Math.floor((currentTime - new Date(activeOrder.opened_at).getTime()) / 60000))
          : 0;

        return (
          <div
            className="fixed inset-0 z-50 flex flex-col justify-end md:flex-row md:justify-end bg-black/50 backdrop-blur-xs"
            onClick={() => setSelectedTable(null)}
          >
            <div
              className="w-full md:max-w-md max-h-[95vh] md:max-h-full h-auto md:h-full p-3.5 sm:p-4 flex flex-col justify-between overflow-y-auto rounded-t-3xl md:rounded-none shadow-2xl"
              style={{
                backgroundColor: "var(--paper)",
                borderLeft: "1px solid var(--hairline)",
                color: "var(--ink)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Thermal Print Stylesheet: Guaranteed 1-page 80mm POS receipt output */}
              <style jsx global>{`
                @media print {
                  html, body {
                    background: #ffffff !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    width: 100% !important;
                  }
                  /* Hide all web UI, backgrounds, overlays and buttons */
                  body * {
                    visibility: hidden !important;
                  }
                  /* Show ONLY the clean thermal receipt */
                  #printable-thermal-receipt,
                  #printable-thermal-receipt * {
                    visibility: visible !important;
                  }
                  #printable-thermal-receipt {
                    display: block !important;
                    position: fixed !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 80mm !important;
                    max-width: 80mm !important;
                    margin: 0 !important;
                    padding: 3mm 4mm !important;
                    color: #000000 !important;
                    background: #ffffff !important;
                    font-family: monospace, 'Courier New', Courier !important;
                    font-size: 11px !important;
                    line-height: 1.3 !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    page-break-after: avoid !important;
                    page-break-inside: avoid !important;
                  }
                  @page {
                    size: 80mm auto;
                    margin: 0;
                  }
                }
              `}</style>

              {/* DEDICATED THERMAL RECEIPT (Visible only during window.print()) */}
              <div id="printable-thermal-receipt" className="hidden print:block">
                <div style={{ textAlign: "center", marginBottom: "6px" }}>
                  <h1 style={{ fontSize: "16px", fontWeight: "900", margin: "0", letterSpacing: "1px", textTransform: "uppercase" }}>
                    {restaurant?.name || "ORDER DESK RESTAURANT"}
                  </h1>
                  <div style={{ fontSize: "10px", marginTop: "2px", fontWeight: "bold" }}>
                    *** DINING TABLE RECEIPT ***
                  </div>
                </div>

                <div style={{ borderTop: "1px dashed #000", borderBottom: "1px dashed #000", padding: "4px 0", margin: "4px 0", fontSize: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>TABLE: <strong>{selectedTable}</strong></span>
                    <span>ORDER: <strong>#{activeOrder?.id ? activeOrder.id.slice(0, 6) : "NEW"}</strong></span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                    <span>SERVER: {currentUser?.name || "Floor staff"}</span>
                    <span>{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}, {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", margin: "6px 0" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #000" }}>
                      <th style={{ textAlign: "left", paddingBottom: "3px" }}>ITEM</th>
                      <th style={{ textAlign: "center", paddingBottom: "3px" }}>QTY</th>
                      <th style={{ textAlign: "right", paddingBottom: "3px" }}>RATE</th>
                      <th style={{ textAlign: "right", paddingBottom: "3px" }}>AMT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chitItems.map((item) => {
                      const rate = Number(item.unit_price) || Number(item.menu_items?.price) || 0;
                      return (
                        <tr key={item.id} style={{ borderBottom: "1px dotted #ccc" }}>
                          <td style={{ textAlign: "left", padding: "3px 0", fontWeight: "600" }}>
                            {item.menu_items?.name || "Dish"}
                          </td>
                          <td style={{ textAlign: "center", padding: "3px 0" }}>{item.qty}</td>
                          <td style={{ textAlign: "right", padding: "3px 0" }}>₹{rate}</td>
                          <td style={{ textAlign: "right", padding: "3px 0", fontWeight: "bold" }}>₹{item.qty * rate}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div style={{ borderTop: "1px dashed #000", paddingTop: "4px", fontSize: "10px", lineHeight: "1.4" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Subtotal ({chitItems.reduce((acc, it) => acc + it.qty, 0)} items):</span>
                    <span>₹{subtotal.toLocaleString("en-IN")}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>CGST (2.5%):</span>
                    <span>₹{cgst.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>SGST (2.5%):</span>
                    <span>₹{sgst.toFixed(2)}</span>
                  </div>
                  <div style={{ borderTop: "1px solid #000", borderBottom: "1px solid #000", margin: "4px 0", padding: "4px 0", display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: "900" }}>
                    <span>TOTAL PAYABLE:</span>
                    <span>₹{grandTotal.toLocaleString("en-IN")}</span>
                  </div>
                </div>

                <div style={{ textAlign: "center", marginTop: "8px", fontSize: "9px" }}>
                  <div>*** THANK YOU! VISIT AGAIN ***</div>
                  <div style={{ marginTop: "2px", opacity: 0.7 }}>Powered by Order Desk</div>
                </div>
              </div>

              {/* Drag handle for mobile */}
              <div className="w-10 h-1 bg-stone-300 rounded-full mx-auto mb-1.5 md:hidden shrink-0 print:hidden" />
              <div className="print:hidden">
                {/* Drawer Header */}
                <div className="flex justify-between items-start pb-2 border-b border-dashed" style={{ borderColor: "var(--hairline)" }}>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--rust)" }}>
                      Active Table Slip
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-heading text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
                        Table {selectedTable}
                      </h2>
                      {activeOrder?.table_session_id?.startsWith("joined:") && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          🔗 Group: +{activeOrder.table_session_id.replace("joined:", "").split(",").filter((n: string) => n.trim() !== selectedTable).join(" + ")}
                        </span>
                      )}
                      {activeOrder?.table_session_id?.startsWith("merged_into:") && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          🔗 Joined into Table {activeOrder.table_session_id.replace("merged_into:", "").trim()}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTable(null)}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer hover:bg-black/5 transition-colors"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    ✕
                  </button>
                </div>

                {/* Ultra-compact Session Meta pill bar */}
                <div className="flex items-center justify-between py-1.5 px-2.5 my-2 rounded-lg text-[11px] border" style={{ backgroundColor: "var(--paper-dim)", borderColor: "var(--hairline)" }}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: activeOrder ? "var(--rust)" : "var(--sage)" }} />
                    <span className="font-semibold" style={{ color: activeOrder ? "var(--rust)" : "var(--sage)" }}>
                      {activeOrder ? `Active (${elapsed}m)` : "Ready for seating"}
                    </span>
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--ink-soft)" }}>
                    Server: <strong className="font-bold" style={{ color: "var(--ink)" }}>{currentUser?.name || "Floor staff"}</strong>
                  </div>
                </div>

                {/* Ordered Items with Permissions check */}
                {chitItems.length > 0 ? (
                  <div className="pt-1">
                    {/* Receipt Table Column Headers */}
                    <div className="text-[10px] font-bold uppercase tracking-wider pb-1 mb-1 border-b border-dashed flex items-center justify-between text-stone-500" style={{ borderColor: "var(--hairline)" }}>
                      <span className="w-1/2">Dish</span>
                      <span className="w-10 text-center">Qty</span>
                      <span className="w-14 text-right">Total</span>
                      <span className="w-16 text-right">Edit</span>
                    </div>

                    {/* Continuous Receipt Item Rows (No Chunky Box Outlines) */}
                    <div className="divide-y divide-dashed divide-stone-200/80 max-h-[42vh] sm:max-h-[46vh] overflow-y-auto pr-1">
                      {chitItems.map((item) => {
                        const rate = Number(item.unit_price) || Number(item.menu_items?.price) || 0;
                        return (
                          <div
                            key={item.id}
                            className="py-1.5 flex items-center justify-between text-xs hover:bg-black/[0.02] transition-colors"
                          >
                            {/* Dish name & rate */}
                            <div className="w-1/2 pr-2 min-w-0">
                              <span className="font-bold text-xs truncate block text-stone-900 leading-tight">
                                {item.menu_items?.name || "Dish"}
                              </span>
                              <span className="text-[10px] text-stone-500 font-mono">
                                ₹{rate} each
                              </span>
                            </div>

                            {/* Qty */}
                            <div className="w-10 text-center font-mono font-bold text-xs text-stone-800">
                              {item.qty}×
                            </div>

                            {/* Line total */}
                            <div className="w-14 text-right font-receipt font-bold text-xs text-stone-900">
                              ₹{item.qty * rate}
                            </div>

                            {/* Mini Stepper / Locked */}
                            <div className="w-16 flex justify-end shrink-0">
                              {canEditOrders ? (
                                <div className="flex items-center bg-white rounded border border-stone-300 shadow-2xs overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQty(item.id, item.qty - 1)}
                                    className="w-4 h-5 flex items-center justify-center font-bold text-[10px] text-stone-700 hover:bg-stone-100 cursor-pointer active:bg-stone-200"
                                    title="Decrease quantity"
                                  >
                                    -
                                  </button>
                                  <span className="font-receipt font-bold px-1 text-[11px] min-w-[14px] text-center text-stone-900">
                                    {item.qty}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQty(item.id, item.qty + 1)}
                                    className="w-4 h-5 flex items-center justify-center font-bold text-[10px] text-stone-700 hover:bg-stone-100 cursor-pointer active:bg-stone-200"
                                    title="Increase quantity"
                                  >
                                    +
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItem(item.id)}
                                    className="w-4 h-5 flex items-center justify-center text-[9px] text-red-600 hover:bg-red-50 border-l border-stone-200 cursor-pointer"
                                    title="Remove dish"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <span
                                  className="text-[9px] px-1.5 py-0.5 rounded font-mono font-medium bg-stone-100 text-stone-500 border border-stone-200"
                                  title="Edit locked by restaurant owner"
                                >
                                  locked
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Tax & Grand Total Breakdown */}
                    <div className="mt-2 pt-2 border-t-2 border-dashed space-y-0.5 text-xs font-receipt" style={{ borderColor: "var(--hairline)" }}>
                      <div className="flex justify-between text-[11px]" style={{ color: "var(--ink-soft)" }}>
                        <span>Subtotal ({chitItems.reduce((acc, it) => acc + it.qty, 0)} items)</span>
                        <span>₹{subtotal.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between text-[10px]" style={{ color: "var(--ink-soft)" }}>
                        <span>CGST (2.5%)</span>
                        <span>₹{cgst.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[10px]" style={{ color: "var(--ink-soft)" }}>
                        <span>SGST (2.5%)</span>
                        <span>₹{sgst.toFixed(2)}</span>
                      </div>
                      <div className="pt-1.5 flex justify-between items-baseline border-t border-stone-300">
                        <span className="font-heading text-xs font-bold uppercase tracking-wider" style={{ color: "var(--ink)" }}>
                          Total payable
                        </span>
                        <span className="font-heading text-2xl font-bold" style={{ color: "var(--rust)" }}>
                          ₹{grandTotal.toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center" style={{ color: "var(--ink-soft)" }}>
                    <p className="text-xs">No active orders on Table {selectedTable}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderTable(selectedTable);
                        setIsNewOrderOpen(true);
                      }}
                      className="mt-2.5 px-3 py-1.5 text-xs font-bold rounded cursor-pointer"
                      style={{ backgroundColor: "var(--rust)", color: "var(--rust-text)", borderRadius: "4px" }}
                    >
                      + Create order for Table {selectedTable}
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons (Sticky at bottom on mobile) */}
              <div className="pt-2 pb-safe border-t border-dashed space-y-1.5 shrink-0 bg-[var(--paper)] sticky bottom-0" style={{ borderColor: "var(--hairline)" }}>
                {chitItems.length > 0 && (
                  <>
                    {/* Waiter Approval Callout if Table has pending verification */}
                    {pendingApprovals.filter(b => b.tableNumber === selectedTable).map(batch => (
                      <div key={batch.id} className="p-2.5 rounded-xl border border-amber-300 bg-amber-50 space-y-1.5 shadow-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                            <span>👨‍💼</span>
                            <span>Awaiting Captain Approval</span>
                          </span>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 border border-amber-300">
                            ₹{batch.totalAmount}
                          </span>
                        </div>
                        <p className="text-[10px] text-amber-800 leading-tight">
                          {batch.totalItems} guest item(s) in queue. Verify at table before firing to kitchen.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedApprovalBatch(batch);
                            setIsApprovalModalOpen(true);
                          }}
                          className="w-full py-1.5 px-3 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-white cursor-pointer shadow-xs active:scale-95 transition-all text-center"
                        >
                          Verify &amp; Approve Order Slip →
                        </button>
                      </div>
                    ))}

                    {/* Table Management segmented row (3-in-a-row) */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {canEditOrders ? (
                        <button
                          type="button"
                          onClick={() => {
                            setOrderTable(selectedTable);
                            setIsNewOrderOpen(true);
                          }}
                          className="py-1.5 px-1.5 text-[11px] font-bold rounded-lg border bg-white hover:bg-stone-50 flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs"
                          style={{ borderColor: "var(--hairline)", color: "var(--ink)" }}
                        >
                          <span>➕</span>
                          <span>Add Dishes</span>
                        </button>
                      ) : (
                        <div
                          className="py-1.5 px-1 text-[10px] rounded-lg border text-center flex items-center justify-center text-stone-400 bg-stone-50 italic truncate"
                          style={{ borderColor: "var(--hairline)" }}
                          title="Add dishes locked by owner"
                        >
                          🔒 Add Locked
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setIsMergeOpen((prev) => !prev);
                          setIsTransferOpen(false);
                        }}
                        className="py-1.5 px-1.5 text-[11px] font-bold rounded-lg border flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        style={{
                          backgroundColor: isMergeOpen ? "#FEF3C7" : "#FFFFFF",
                          borderColor: isMergeOpen ? "#D97706" : "var(--hairline)",
                          color: isMergeOpen ? "#92400E" : "var(--ink)",
                        }}
                        title="Join two tables together into a single combined order"
                      >
                        <span>🔗</span>
                        <span>{isMergeOpen ? "Close" : "Join Table"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsTransferOpen((prev) => !prev);
                          setIsMergeOpen(false);
                        }}
                        className="py-1.5 px-1.5 text-[11px] font-bold rounded-lg border flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        style={{
                          backgroundColor: isTransferOpen ? "#DBEAFE" : "#FFFFFF",
                          borderColor: isTransferOpen ? "#2563EB" : "var(--hairline)",
                          color: isTransferOpen ? "#1E40AF" : "var(--ink)",
                        }}
                        title="Transfer this order to another table"
                      >
                        <span>🔄</span>
                        <span>{isTransferOpen ? "Close" : "Shift Table"}</span>
                      </button>
                    </div>

                    {/* Inline Merge / Join Drawer */}
                    {isMergeOpen && (
                      <div className="p-2.5 rounded-xl border bg-amber-50/70 space-y-1.5 border-amber-200 shadow-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-amber-950 flex items-center gap-1">
                            <span>🔗</span>
                            <span>Join Another Table with Table {selectedTable}</span>
                          </span>
                        </div>
                        <p className="text-[10px] text-amber-800 leading-tight">
                          Both tables will be combined into a single group bill.
                        </p>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={mergeSourceTable}
                            onChange={(e) => setMergeSourceTable(e.target.value)}
                            className="flex-1 py-1 px-2 text-xs rounded-lg border bg-white font-semibold"
                            style={{ borderColor: "var(--hairline)" }}
                          >
                            <option value="">Select table to join...</option>
                            {floorTables
                              .filter((t) => t.number !== selectedTable)
                              .map((t) => (
                                <option key={t.number} value={t.number}>
                                  Table {t.number} ({t.isOccupied ? "Seated" : "Empty"})
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            disabled={!mergeSourceTable || isMerging}
                            onClick={handleMergeTables}
                            className="px-2.5 py-1 text-xs font-bold rounded-lg text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-50 cursor-pointer shadow-xs whitespace-nowrap"
                          >
                            {isMerging ? "Joining..." : "Join"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Inline Shift / Transfer Drawer */}
                    {isTransferOpen && (
                      <div className="p-2.5 rounded-xl border bg-blue-50/70 space-y-1.5 border-blue-200 shadow-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-blue-950 flex items-center gap-1">
                            <span>🔄</span>
                            <span>Shift Table {selectedTable} to New Table</span>
                          </span>
                        </div>
                        <p className="text-[10px] text-blue-800 leading-tight">
                          Move party and active ticket to another table.
                        </p>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={transferTargetTable}
                            onChange={(e) => setTransferTargetTable(e.target.value)}
                            className="flex-1 py-1 px-2 text-xs rounded-lg border bg-white font-semibold"
                            style={{ borderColor: "var(--hairline)" }}
                          >
                            <option value="">Select destination table...</option>
                            {floorTables
                              .filter((t) => t.number !== selectedTable)
                              .map((t) => (
                                <option key={t.number} value={t.number}>
                                  Table {t.number} ({t.isOccupied ? "Occupied" : "Available"})
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            disabled={!transferTargetTable || isMerging}
                            onClick={handleTransferTable}
                            className="px-2.5 py-1 text-xs font-bold rounded-lg text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 cursor-pointer shadow-xs whitespace-nowrap"
                          >
                            {isMerging ? "Moving..." : "Shift"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Primary Actions: Print Thermal Receipt & Mark Paid side-by-side */}
                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="w-1/3 py-2.5 px-3 rounded-xl text-xs font-bold cursor-pointer shrink-0 flex items-center justify-center gap-1.5 border border-stone-300 bg-white text-stone-800 hover:bg-stone-50 active:scale-98 transition-all shadow-xs"
                        title="Print thermal guest receipt"
                      >
                        <span>🖨️</span>
                        <span>Print Slip</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSettleTable(selectedTable, activeTableObj?.id, activeOrder?.id)}
                        disabled={isSettling}
                        className="flex-1 py-2.5 px-4 rounded-xl text-xs font-black text-white cursor-pointer shadow-md transition-all active:scale-98 flex items-center justify-center gap-1.5"
                        style={{
                          backgroundColor: "var(--sage)",
                        }}
                      >
                        <span>✓</span>
                        <span>{isSettling ? "Settling..." : "Mark paid & free table"}</span>
                      </button>
                    </div>

                    {/* Void Order (guarded by canDeleteOrders) */}
                    {activeOrder && canDeleteOrders && (
                      <button
                        type="button"
                        onClick={() => handleVoidOrder(activeOrder.id, selectedTable)}
                        className="w-full py-0.5 text-[10px] text-red-600 hover:text-red-800 hover:underline cursor-pointer text-center block"
                      >
                        Void order and free table
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: New Order Creation - Upgraded to Mobile Bottom Sheet with Sticky Dispatch */}
      {isNewOrderOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => setIsNewOrderOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-[var(--paper)] rounded-t-3xl sm:rounded-xl max-h-[90vh] sm:max-h-[85vh] flex flex-col shadow-2xl border border-[var(--hairline)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Sheet Drag Handle */}
            <div className="w-12 h-1.5 bg-stone-300 rounded-full mx-auto my-2.5 sm:hidden shrink-0" />

            <div className="flex justify-between items-start px-5 py-3 sm:py-4 border-b border-dashed shrink-0" style={{ borderColor: "var(--hairline)" }}>
              <div>
                <span className="text-xs font-semibold" style={{ color: "var(--rust)" }}>
                  Kitchen Order Dispatch
                </span>
                <h3 className="font-heading text-xl font-bold" style={{ color: "var(--ink)" }}>
                  Create Quick Order
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewOrderOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700 text-sm font-bold cursor-pointer rounded-full hover:bg-stone-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrderSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold mb-1" style={{ color: "var(--ink-soft)" }}>
                      Station Table
                    </label>
                  <select
                    value={orderTable}
                    onChange={(e) => setOrderTable(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded font-bold focus:outline-none"
                    style={{
                      backgroundColor: "var(--paper-dim)",
                      border: "1px solid var(--hairline)",
                      color: "var(--ink)",
                    }}
                  >
                    {floorTables.map((t) => (
                      <option key={t.number} value={t.number}>
                        Table {t.number} ({t.statusLabel})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold mb-1" style={{ color: "var(--ink-soft)" }}>
                    Guest Count
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={orderGuests}
                    onChange={(e) => setOrderGuests(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded font-bold focus:outline-none"
                    style={{
                      backgroundColor: "var(--paper-dim)",
                      border: "1px solid var(--hairline)",
                      color: "var(--ink)",
                    }}
                  />
                </div>
              </div>

              {/* Dish Search & Category Filters */}
              <div>
                <input
                  type="text"
                  placeholder="🔍 Search dish by name (e.g. Biryani, Paneer, Naan)..."
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-xs focus:outline-none bg-white mb-2"
                  style={{ borderColor: "var(--hairline)", color: "var(--ink)" }}
                />

                {/* Categories */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
                  <button
                    type="button"
                    onClick={() => setQuickCategory("all")}
                    className={`px-2.5 py-1 rounded-full font-bold cursor-pointer transition-colors ${
                      quickCategory === "all" ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                  >
                    All
                  </button>
                  {quickCategories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setQuickCategory(c.id)}
                      className={`px-2.5 py-1 rounded-full font-bold cursor-pointer whitespace-nowrap transition-colors ${
                        quickCategory === c.id ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Menu Dishes List */}
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {(() => {
                  const availableDishes = quickMenuItems.length > 0
                    ? quickMenuItems
                    : bestsellers.map((b) => ({ ...b, category_id: undefined }));

                  const filtered = availableDishes.filter((d) => {
                    const matchesCategory = quickCategory === "all" || d.category_id === quickCategory;
                    const matchesSearch = !quickSearch || d.name.toLowerCase().includes(quickSearch.toLowerCase());
                    return matchesCategory && matchesSearch;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="p-4 text-center text-stone-400 text-xs">
                        No dishes match &quot;{quickSearch}&quot;
                      </div>
                    );
                  }

                  return filtered.map((dish) => {
                    const currentCart = quickCart[dish.id];
                    const qty = currentCart?.qty || 0;

                    return (
                      <div
                        key={dish.id}
                        className="p-2.5 rounded-lg border bg-white flex flex-col gap-1.5 shadow-xs transition-colors"
                        style={{ borderColor: qty > 0 ? "var(--rust)" : "var(--hairline)" }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={dish.is_veg ? "veg-indicator" : "nonveg-indicator"} />
                            <span className="font-bold text-xs" style={{ color: "var(--ink)" }}>{dish.name}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="font-receipt font-bold text-xs" style={{ color: "var(--ink)" }}>
                              ₹{dish.price}
                            </span>

                            {qty === 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setQuickCart((prev) => ({
                                    ...prev,
                                    [dish.id]: { qty: 1, notes: "", item: dish },
                                  }));
                                }}
                                className="px-2.5 py-1 rounded text-xs font-bold text-white cursor-pointer active:scale-95"
                                style={{ backgroundColor: "var(--rust)", borderRadius: "4px" }}
                              >
                                + Add
                              </button>
                            ) : (
                              <div className="flex items-center border rounded overflow-hidden" style={{ borderColor: "var(--rust)" }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickCart((prev) => {
                                      const next = { ...prev };
                                      if (next[dish.id].qty <= 1) {
                                        delete next[dish.id];
                                      } else {
                                        next[dish.id].qty -= 1;
                                      }
                                      return next;
                                    });
                                  }}
                                  className="w-6 h-6 flex items-center justify-center font-bold text-xs bg-stone-100 hover:bg-stone-200 cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="font-receipt font-bold px-2 text-xs">{qty}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickCart((prev) => ({
                                      ...prev,
                                      [dish.id]: { ...prev[dish.id], qty: prev[dish.id].qty + 1 },
                                    }));
                                  }}
                                  className="w-6 h-6 flex items-center justify-center font-bold text-xs bg-stone-100 hover:bg-stone-200 cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {qty > 0 && (
                          <input
                            type="text"
                            placeholder="Optional note (less spice, crispy)..."
                            value={currentCart?.notes || ""}
                            onChange={(e) => {
                              const noteVal = e.target.value;
                              setQuickCart((prev) => ({
                                ...prev,
                                [dish.id]: { ...prev[dish.id], notes: noteVal },
                              }));
                            }}
                            className="w-full px-2 py-1 text-[11px] rounded border bg-stone-50/70 focus:outline-none"
                            style={{ borderColor: "var(--hairline)" }}
                          />
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
              </div>

              {/* Cart Summary & Sticky Dispatch Button */}
              {(() => {
                const cartList = Object.values(quickCart).filter((c) => c.qty > 0);
                const totalQty = cartList.reduce((sum, c) => sum + c.qty, 0);
                const totalAmount = cartList.reduce((sum, c) => sum + c.qty * c.item.price, 0);

                return (
                  <div className="p-4 bg-[var(--paper-dim)] border-t border-[var(--hairline)] shrink-0 space-y-2.5 sticky bottom-0">
                    <div className="flex justify-between items-baseline text-xs font-bold px-1">
                      <span className="text-stone-600">
                        {totalQty > 0 ? `${totalQty} item(s) selected` : "No items added"}
                      </span>
                      <span className="font-receipt text-sm font-black" style={{ color: "var(--rust)" }}>
                        Total: ₹{totalAmount.toLocaleString("en-IN")}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsNewOrderOpen(false)}
                        className="px-3.5 py-2 rounded text-xs font-semibold cursor-pointer text-stone-600 hover:bg-stone-200/60"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={totalQty === 0 || isQuickSubmitting}
                        className="px-4 py-2.5 rounded text-xs font-bold cursor-pointer transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
                        style={{ backgroundColor: "var(--rust)", color: "var(--rust-text)", borderRadius: "4px" }}
                      >
                        {isQuickSubmitting ? (
                          <span>Sending KOT...</span>
                        ) : (
                          <>
                            <span>🚀</span>
                            <span>Send KOT to Kitchen</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </form>
          </div>
        </div>
      )}

      {/* SHARE MENU MODAL */}
      <ShareMenuModal
        isOpen={isShareMenuOpen}
        onClose={() => setIsShareMenuOpen(false)}
        restaurantName={activeRestaurantName}
        tables={(liveTables || []).map((t) => ({ id: t.id, table_number: t.table_number, qr_token: t.qr_token || "" }))}
      />

      {/* OWNER SMART UPSELL & BASKET PAIRING CONFIG MODAL */}
      {isUpsellModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in"
          style={{ backgroundColor: "rgba(34, 29, 22, 0.6)" }}
          onClick={() => setIsUpsellModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-4 animate-scale-up"
            style={{
              backgroundColor: "var(--paper)",
              borderColor: "var(--hairline)",
              color: "var(--ink)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--hairline)" }}>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center text-lg border border-amber-500/30">
                  💡
                </div>
                <div>
                  <h3 className="font-heading text-lg font-bold">Smart Upsell &amp; Basket Pairing</h3>
                  <p className="text-xs text-stone-500">Configure context-aware dish recommendations for diner cart</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUpsellModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold hover:bg-black/5 cursor-pointer text-stone-400"
              >
                ✕
              </button>
            </div>

            {/* SUPER ADMIN LOCK BANNER (If Delegation is Disabled) */}
            {upsellConfig.ownerCanManageUpsell === false ? (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <span>🔒</span>
                  <span>Centrally Managed by Platform Super Admin</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Smart upsell configuration is centrally enforced for your outlet. Below are your currently active rules in read-only mode. Contact your Super Admin if you need customized pairing parameters.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
                <span>✓</span>
                <span>Super Admin has delegated full upsell management to your restaurant desk.</span>
              </div>
            )}

            {/* Master Switch */}
            <div
              className="p-3.5 rounded-xl border flex items-center justify-between"
              style={{ backgroundColor: "var(--paper-dim)", borderColor: "var(--hairline)" }}
            >
              <div>
                <div className="text-xs font-bold">Enable Smart Upsell &amp; Pairings</div>
                <div className="text-[11px] text-stone-500">
                  Show recommended pairings in diner mobile cart drawer
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  disabled={upsellConfig.ownerCanManageUpsell === false}
                  checked={upsellConfig.enabled}
                  onChange={(e) =>
                    setUpsellConfig({
                      ...upsellConfig,
                      enabled: e.target.checked,
                    })
                  }
                  className="sr-only peer disabled:opacity-50"
                />
                <div className="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--rust)]" />
              </label>
            </div>

            {/* Strategy Selector */}
            <div>
              <label className="text-xs font-bold block mb-1.5">Pairing Strategy</label>
              <select
                disabled={upsellConfig.ownerCanManageUpsell === false}
                value={upsellConfig.strategy}
                onChange={(e) =>
                  setUpsellConfig({
                    ...upsellConfig,
                    strategy: e.target.value as UpsellStrategy,
                  })
                }
                className="w-full px-3 py-2 rounded-lg border text-xs bg-white focus:outline-none disabled:bg-stone-100"
                style={{ borderColor: "var(--hairline)" }}
              >
                <option value="smart_ai">⚡ Smart AI Pairing (Curry → Breads/Rice, Starters → Drinks, Meals → Desserts)</option>
                <option value="bestsellers">🔥 Top Bestsellers (Highest demand items across menu)</option>
                <option value="high_margin">💰 High Margin Boosters (Beverages &amp; Appetizers)</option>
                <option value="budget_addons">🪙 Budget Add-ons (Dishes under ₹120 for instant additions)</option>
              </select>
            </div>

            {/* Cart Drawer Headline */}
            <div>
              <label className="text-xs font-bold block mb-1">Cart Drawer Section Title</label>
              <input
                type="text"
                disabled={upsellConfig.ownerCanManageUpsell === false}
                value={upsellConfig.headline}
                onChange={(e) =>
                  setUpsellConfig({
                    ...upsellConfig,
                    headline: e.target.value,
                  })
                }
                placeholder="Frequently Ordered Together"
                className="w-full px-3 py-2 rounded-lg border text-xs bg-white focus:outline-none disabled:bg-stone-100"
                style={{ borderColor: "var(--hairline)" }}
              />
            </div>

            {/* Max Items */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold block">Maximum Recommendations in Drawer</label>
                <span className="text-[11px] text-stone-500">Number of suggestions diner sees simultaneously</span>
              </div>
              <select
                disabled={upsellConfig.ownerCanManageUpsell === false}
                value={upsellConfig.maxItems}
                onChange={(e) =>
                  setUpsellConfig({
                    ...upsellConfig,
                    maxItems: Number(e.target.value) || 3,
                  })
                }
                className="px-3 py-1.5 rounded-lg border text-xs bg-white focus:outline-none disabled:bg-stone-100"
                style={{ borderColor: "var(--hairline)" }}
              >
                <option value={2}>2 Items</option>
                <option value={3}>3 Items (Recommended)</option>
                <option value={4}>4 Items</option>
                <option value={5}>5 Items</option>
                <option value={6}>6 Items</option>
              </select>
            </div>

            {/* Behavioral Pairing Flags */}
            <div className="space-y-2 pt-2 border-t" style={{ borderColor: "var(--hairline)" }}>
              <label className="flex items-center justify-between p-2.5 rounded-lg border bg-white cursor-pointer" style={{ borderColor: "var(--hairline)" }}>
                <div>
                  <div className="text-xs font-bold">Push Beverages with Starters &amp; Spicy Food</div>
                  <div className="text-[10px] text-stone-500">Intelligently pairs coolers, lassi, and mocktails with appetizers</div>
                </div>
                <input
                  type="checkbox"
                  disabled={upsellConfig.ownerCanManageUpsell === false}
                  checked={upsellConfig.pushBeveragesWithStarters}
                  onChange={(e) =>
                    setUpsellConfig({
                      ...upsellConfig,
                      pushBeveragesWithStarters: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded accent-[var(--rust)] cursor-pointer disabled:opacity-50"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-lg border bg-white cursor-pointer" style={{ borderColor: "var(--hairline)" }}>
                <div>
                  <div className="text-xs font-bold">Push Desserts Near Checkout</div>
                  <div className="text-[10px] text-stone-500">Offers sweets and ice cream when main course items are selected</div>
                </div>
                <input
                  type="checkbox"
                  disabled={upsellConfig.ownerCanManageUpsell === false}
                  checked={upsellConfig.pushDessertsNearCheckout}
                  onChange={(e) =>
                    setUpsellConfig({
                      ...upsellConfig,
                      pushDessertsNearCheckout: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded accent-[var(--rust)] cursor-pointer disabled:opacity-50"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-lg border bg-white cursor-pointer" style={{ borderColor: "var(--hairline)" }}>
                <div>
                  <div className="text-xs font-bold">Spend Goal Progress Nudge</div>
                  <div className="text-[10px] text-stone-500">Shows interactive progress bar towards unlocking discount vouchers</div>
                </div>
                <input
                  type="checkbox"
                  disabled={upsellConfig.ownerCanManageUpsell === false}
                  checked={upsellConfig.showSpendGoalNudge}
                  onChange={(e) =>
                    setUpsellConfig({
                      ...upsellConfig,
                      showSpendGoalNudge: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded accent-[var(--rust)] cursor-pointer disabled:opacity-50"
                />
              </label>
            </div>

            {/* Save Feedback and Action Buttons */}
            {upsellSaveMsg && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold text-center">
                ✓ {upsellSaveMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: "var(--hairline)" }}>
              <button
                type="button"
                onClick={() => setIsUpsellModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
              >
                Close
              </button>

              {upsellConfig.ownerCanManageUpsell !== false && (
                <button
                  type="button"
                  disabled={isSavingUpsell}
                  onClick={async () => {
                    setIsSavingUpsell(true);
                    setUpsellSaveMsg("");
                    try {
                      const res = await fetch("/api/restaurant/upsell", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(upsellConfig),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.message || "Failed to update upsell settings");
                      setUpsellSaveMsg("Smart upsell settings saved successfully!");
                      setTimeout(() => {
                        setIsUpsellModalOpen(false);
                        setUpsellSaveMsg("");
                      }, 1000);
                    } catch (err) {
                      alert(err instanceof Error ? err.message : "Failed to update settings");
                    } finally {
                      setIsSavingUpsell(false);
                    }
                  }}
                  className="px-5 py-2 rounded-lg text-xs font-bold cursor-pointer text-white shadow-sm transition-transform active:scale-95 disabled:opacity-50"
                  style={{ backgroundColor: "var(--rust)" }}
                >
                  {isSavingUpsell ? "Saving Changes..." : "Save Settings"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Order Verification Modal (Captain Approval before Kitchen KOT) */}
      {isApprovalModalOpen && selectedApprovalBatch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ backgroundColor: "rgba(34, 29, 22, 0.65)" }}
          onClick={() => {
            if (!isProcessingApproval) {
              setIsApprovalModalOpen(false);
              setShowRejectInput(false);
            }
          }}
        >
          <div
            className="w-full max-w-lg p-5 rounded-2xl border shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto space-y-4"
            style={{
              backgroundColor: "var(--paper)",
              borderColor: "var(--hairline)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b pb-3" style={{ borderColor: "var(--hairline)" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center text-xl border border-amber-500/30">
                  👨‍💼
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading text-xl font-bold text-stone-900">
                      Table {selectedApprovalBatch.tableNumber} Order Verification
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-300">
                      Pending
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Guest: <strong className="text-stone-800 font-semibold">{selectedApprovalBatch.customerName || "Dine-in Guest"}</strong> · Held from kitchen until your approval
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isProcessingApproval) {
                    setIsApprovalModalOpen(false);
                    setShowRejectInput(false);
                  }
                }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold hover:bg-black/5 cursor-pointer text-stone-400"
              >
                ✕
              </button>
            </div>

            {/* Reassurance Notice */}
            <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <span className="text-base">ℹ️</span>
              <span>
                Verify this order with the guest at Table {selectedApprovalBatch.tableNumber}. Approving will immediately generate kitchen KOT tickets.
              </span>
            </div>

            {/* Item Breakdown List */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-stone-600 uppercase tracking-wider">
                Order Items ({selectedApprovalBatch.totalItems} Total Qty)
              </div>

              {(() => {
                const batchItems = openOrders
                  .flatMap((o) => o.order_items || [])
                  .filter((it) => selectedApprovalBatch.itemIds.includes(it.id));

                if (batchItems.length === 0) {
                  return (
                    <div className="p-4 rounded-xl border border-dashed bg-white text-center text-xs text-stone-500">
                      {selectedApprovalBatch.totalItems} item(s) in batch · Total ₹{selectedApprovalBatch.totalAmount}
                    </div>
                  );
                }

                return (
                  <div className="divide-y rounded-xl border bg-white overflow-hidden shadow-xs" style={{ borderColor: "var(--hairline)" }}>
                    {batchItems.map((item) => (
                      <div key={item.id} className="p-3 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span
                            className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black mt-0.5 border"
                            style={{
                              borderColor: item.menu_items?.is_veg ? "#16A34A" : "#DC2626",
                              color: item.menu_items?.is_veg ? "#16A34A" : "#DC2626",
                            }}
                          >
                            ●
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-stone-900">
                                {item.menu_items?.name || "Dish"}
                              </span>
                              <span className="text-[11px] font-bold px-1.5 py-0.2 rounded bg-stone-100 text-stone-700">
                                ×{item.qty}
                              </span>
                            </div>
                            {item.notes && (
                              <div className="text-[11px] text-amber-700 italic mt-0.5">
                                ✏️ &quot;{item.notes}&quot;
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-xs font-mono font-bold text-stone-800 whitespace-nowrap">
                          ₹{(Number(item.unit_price) || Number(item.menu_items?.price) || 0) * item.qty}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Total Summary Strip */}
            <div
              className="p-3 rounded-xl border flex items-center justify-between font-bold"
              style={{ backgroundColor: "var(--paper-dim)", borderColor: "var(--hairline)" }}
            >
              <span className="text-xs text-stone-600">Total Batch Value</span>
              <span className="font-heading text-lg text-stone-900">₹{selectedApprovalBatch.totalAmount}</span>
            </div>

            {/* Rejection Reason Form */}
            {showRejectInput && (
              <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 space-y-2 animate-fade-in">
                <label className="text-xs font-bold text-rose-950 block">
                  Reason for Rejection (Optional)
                </label>
                <input
                  type="text"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Guest changed mind, dish out of stock"
                  className="w-full px-3 py-2 text-xs bg-white border border-rose-300 rounded-lg focus:outline-none"
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowRejectInput(false)}
                    className="px-3 py-1.5 text-xs text-stone-600 hover:bg-black/5 rounded-lg cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={isProcessingApproval}
                    onClick={() => handleRejectBatch(selectedApprovalBatch.id, rejectionReason)}
                    className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isProcessingApproval ? "Rejecting..." : "Confirm Rejection"}
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {!showRejectInput && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t" style={{ borderColor: "var(--hairline)" }}>
                <button
                  type="button"
                  onClick={() => setShowRejectInput(true)}
                  className="px-3.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors border border-rose-200"
                >
                  ✕ Reject Order
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isProcessingApproval}
                    onClick={() => setIsApprovalModalOpen(false)}
                    className="px-3.5 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-lg cursor-pointer"
                  >
                    Later
                  </button>

                  <button
                    type="button"
                    disabled={isProcessingApproval}
                    onClick={() => handleApproveBatch(selectedApprovalBatch.id)}
                    className="px-5 py-2 text-xs font-bold text-white rounded-lg cursor-pointer shadow-sm transition-transform active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                    style={{ backgroundColor: "var(--rust)" }}
                  >
                    <span>🔥</span>
                    <span>{isProcessingApproval ? "Dispatching..." : "Approve & Fire to Kitchen (KOT)"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
