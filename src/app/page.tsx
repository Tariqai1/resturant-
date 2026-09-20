"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ShareMenuModal from "@/components/ShareMenuModal";

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [theme, setTheme] = useState<"amber" | "crimson">("amber");

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
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());
  const [statusNotification, setStatusNotification] = useState<string | null>(null);
  const previousCallsCountRef = useRef(0);

  // High-pitched double buzzer chime for table attention
  const playBuzzer = useCallback(() => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const audioCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

      // First beep (880 Hz - A5)
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

      // Second higher beep (1318.5 Hz - E6)
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
    } catch {
      // Audio context might be restricted
    }
  }, [soundEnabled]);

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
        if (data.bestsellers) setBestsellers(data.bestsellers);
        if (data.kitchenTickets) setKitchenTickets(data.kitchenTickets);
        if (data.waiterCalls) {
          const calls: WaiterCall[] = data.waiterCalls || [];
          if (calls.length > previousCallsCountRef.current) {
            playBuzzer();
          }
          previousCallsCountRef.current = calls.length;
          setWaiterCalls(calls);
        }
      }
    } catch {
      // Keep running state
    }
  }, [playBuzzer]);

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
      })
      .catch(() => undefined);

    const interval = setInterval(() => {
      fetchDashboardData();
      setCurrentTime(Date.now());
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
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
  const isOwnerOrManager =
    !currentUser?.role ||
    ["owner", "manager", "admin"].includes(currentUser.role.toLowerCase()) ||
    isSuperAdmin;
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
  async function handleSettleTable(tableNum: string) {
    if (isSettling) return;
    setIsSettling(true);
    try {
      const res = await fetch("/api/bills/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNumber: tableNum }),
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

      {/* Dark Cast-Iron Restaurant Sidebar */}
      <aside
        className="w-full md:w-60 flex-shrink-0 flex flex-col justify-between p-5"
        style={{
          backgroundColor: "var(--dark-surface)",
          borderRight: "1px solid rgba(220, 209, 183, 0.15)",
          color: "#FAF6EC",
        }}
      >
        <div>
          {/* Restaurant Brand Header */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-800">
            <div>
              <h1 className="font-heading text-xl font-bold tracking-wide" style={{ color: "#FAF6EC" }}>
                Order Desk
              </h1>
              <p className="text-xs truncate max-w-[170px]" style={{ color: "#9E9382" }}>
                {activeRestaurantName}
              </p>
            </div>
            <button
              type="button"
              className="md:hidden p-1 text-stone-400 hover:text-white"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
            >
              ☰
            </button>
          </div>

          {/* Dynamic Restaurant Theme Pill Switcher */}
          <div className="mb-5 p-2 rounded-lg bg-stone-900/80 border border-stone-800/80">
            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5 flex items-center justify-between">
              <span>Brand Theme</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold" style={{ backgroundColor: theme === "amber" ? "#FFBE0B" : "#741A2F", color: theme === "amber" ? "#2A2312" : "#FFFFFF" }}>
                {theme === "amber" ? "Amber Gold" : "Velvet Crimson"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleToggleTheme("amber")}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${theme === "amber" ? "bg-amber-400/20 text-amber-300 border border-amber-400/50" : "text-stone-400 hover:text-stone-200 border border-transparent"}`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#FFBE0B] shrink-0 border border-stone-900 shadow-sm" />
                <span className="truncate">Amber</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleTheme("crimson")}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${theme === "crimson" ? "bg-rose-950/60 text-rose-300 border border-rose-600/50" : "text-stone-400 hover:text-stone-200 border border-transparent"}`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#741A2F] shrink-0 border border-rose-300/40 shadow-sm" />
                <span className="truncate">Crimson</span>
              </button>
            </div>
          </div>

          {/* Navigation Items (No arrows, clear intent) */}
          <nav className={`space-y-1 text-xs font-medium ${mobileNavOpen ? "block" : "hidden md:block"}`}>
            <Link
              href="/"
              className="flex items-center gap-3 px-3 py-2 rounded font-semibold transition-colors"
              style={{
                backgroundColor: "rgba(193, 101, 44, 0.18)",
                color: "var(--rust)",
                border: "1px solid rgba(193, 101, 44, 0.35)",
              }}
            >
              <span>Floor overview</span>
            </Link>

            <Link
              href="/tables"
              className="flex items-center justify-between px-3 py-2 rounded transition-colors hover:bg-stone-900"
              style={{ color: "#D1C7B7" }}
            >
              <span>Floor layout</span>
              <span
                className="font-receipt text-[11px] px-1.5 py-0.5 rounded font-bold"
                style={{ backgroundColor: "rgba(193, 101, 44, 0.2)", color: "var(--rust)" }}
              >
                {occupiedCount} active
              </span>
            </Link>

            <Link
              href="/kitchen"
              className="flex items-center justify-between px-3 py-2 rounded transition-colors hover:bg-stone-900"
              style={{ color: "#D1C7B7" }}
            >
              <span>Kitchen rail</span>
              <span
                className="font-receipt text-[11px] px-1.5 py-0.5 rounded font-bold"
                style={{ backgroundColor: "rgba(168, 65, 47, 0.2)", color: "var(--brick)" }}
              >
                {kitchenTickets.filter((t) => t.status !== "SERVED").length} pending
              </span>
            </Link>

            <Link
              href="/menu"
              className="flex items-center px-3 py-2 rounded transition-colors hover:bg-stone-900"
              style={{ color: "#D1C7B7" }}
            >
              <span>Menu and stock</span>
            </Link>

            {/* Role-guarded: Only owner, manager, admin see staff */}
            {isOwnerOrManager && (
              <Link
                href="/staff"
                className="flex items-center px-3 py-2 rounded transition-colors hover:bg-stone-900"
                style={{ color: "#D1C7B7" }}
              >
                <span>Staff and roles</span>
              </Link>
            )}

            {isSuperAdmin && (
              <Link
                href="/super-admin"
                className="flex items-center px-3 py-2 rounded transition-colors border border-amber-800/40 bg-amber-950/20 text-amber-300"
              >
                <span>Super admin platform</span>
              </Link>
            )}
          </nav>
        </div>

        {/* Station User & Sign Out */}
        <div className="pt-4 border-t border-stone-800">
          <div className="flex items-center justify-between text-xs">
            <div>
              <div className="font-semibold" style={{ color: "#FAF6EC" }}>
                {currentUser?.name || "Floor staff"}
              </div>
              <div className="text-[11px] capitalize" style={{ color: "#9E9382" }}>
                {currentUser?.role || "staff"}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="px-2 py-1 rounded text-xs hover:bg-stone-800 cursor-pointer"
              style={{ color: "#C4B9A8" }}
              title="Sign out of station"
            >
              {isSigningOut ? "..." : "Sign out"}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Floor Workspace */}
      <main className="flex-1 p-5 md:p-8 overflow-y-auto space-y-6" style={{ backgroundColor: "var(--paper)" }}>
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
            {/* Audio Buzzer Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="px-3 py-2 rounded text-xs font-semibold border cursor-pointer flex items-center gap-1.5 transition-colors"
              style={{
                backgroundColor: soundEnabled ? "var(--paper-dim)" : "#FDF2F0",
                borderColor: soundEnabled ? "var(--hairline)" : "#F5C6CB",
                color: soundEnabled ? "var(--ink)" : "var(--brick)",
              }}
              title={soundEnabled ? "Buzzer sound active" : "Buzzer muted"}
            >
              <span>{soundEnabled ? "🔔" : "🔕"}</span>
              <span className="hidden sm:inline">{soundEnabled ? "Buzzer On" : "Buzzer Muted"}</span>
            </button>

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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="animate-bounce text-base">🛎️</span>
                <span className="font-heading text-sm font-bold tracking-wide" style={{ color: "var(--rust)" }}>
                  {waiterCalls.length} ACTIVE TABLE BUZZER{waiterCalls.length > 1 ? "S" : ""}
                </span>
              </div>
              <span className="text-[11px] font-medium" style={{ color: "var(--ink-soft)" }}>
                Tap &apos;Acknowledge&apos; once staff attends the table
              </span>
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
                const elapsedMin = Math.max(
                  0,
                  Math.floor((currentTime - new Date(call.createdAt).getTime()) / 60000)
                );

                return (
                  <div
                    key={call.id}
                    className="p-3 rounded border flex items-center justify-between gap-3 shadow-sm bg-white"
                    style={{
                      borderColor: "var(--hairline)",
                      borderLeft: "4px solid var(--rust)",
                    }}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{callIcon}</span>
                        <span className="font-heading text-base font-bold" style={{ color: "var(--ink)" }}>
                          Table {call.tableNumber}
                        </span>
                      </div>
                      <div className="text-xs font-semibold mt-0.5" style={{ color: "var(--rust)" }}>
                        {callLabel}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--ink-soft)" }}>
                        {elapsedMin === 0 ? "Just now" : `${elapsedMin} min ago`}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleResolveWaiterCall(call.id)}
                      className="px-3 py-1.5 rounded text-xs font-bold text-white cursor-pointer transition-transform active:scale-95"
                      style={{
                        backgroundColor: "var(--sage)",
                        borderRadius: "4px",
                      }}
                    >
                      Attended ✓
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Real Hierarchy: One Dominant Hero Metric + Grouped Secondary Stats */}
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
                  <div className="flex items-center gap-1.5">
                    <span className="font-heading text-xl font-bold" style={{ color: "var(--ink)" }}>
                      {table.number}
                    </span>
                    {table.joinedBadge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        {table.joinedBadge}
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
            className="fixed inset-0 z-50 flex justify-end"
            style={{ backgroundColor: "rgba(34, 29, 22, 0.45)" }}
            onClick={() => setSelectedTable(null)}
          >
            <div
              className="w-full max-w-md h-full p-6 flex flex-col justify-between overflow-y-auto"
              style={{
                backgroundColor: "var(--paper)",
                borderLeft: "1px solid var(--hairline)",
                color: "var(--ink)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                {/* Drawer Header */}
                <div className="flex justify-between items-start pb-4 border-b border-dashed" style={{ borderColor: "var(--hairline)" }}>
                  <div>
                    <span className="text-xs font-semibold" style={{ color: "var(--rust)" }}>
                      Active Table Slip
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-heading text-3xl font-bold" style={{ color: "var(--ink)" }}>
                        Table {selectedTable}
                      </h2>
                      {activeOrder?.table_session_id?.startsWith("joined:") && (
                        <span className="text-xs px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          🔗 Group Table: +{activeOrder.table_session_id.replace("joined:", "").split(",").filter((n: string) => n.trim() !== selectedTable).join(" + ")}
                        </span>
                      )}
                      {activeOrder?.table_session_id?.startsWith("merged_into:") && (
                        <span className="text-xs px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          🔗 Joined into Table {activeOrder.table_session_id.replace("merged_into:", "").trim()}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTable(null)}
                    className="p-1 text-sm font-bold cursor-pointer"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    ✕
                  </button>
                </div>

                {/* Session Meta */}
                <div className="py-3 my-2 text-xs space-y-1" style={{ color: "var(--ink-soft)" }}>
                  <div className="flex justify-between">
                    <span>Session status</span>
                    <span className="font-semibold" style={{ color: activeOrder ? "var(--rust)" : "var(--sage)" }}>
                      {activeOrder ? `Active (${elapsed}m)` : "Ready for seating"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Server on floor</span>
                    <span className="font-medium" style={{ color: "var(--ink)" }}>
                      {currentUser?.name || "Shift staff"}
                    </span>
                  </div>
                </div>

                {/* Ordered Items with Permissions check */}
                {chitItems.length > 0 ? (
                  <div className="pt-2">
                    <div className="text-xs font-semibold pb-1 mb-2 border-b border-dashed" style={{ borderColor: "var(--hairline)", color: "var(--ink-soft)" }}>
                      Ordered items ({chitItems.length})
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {chitItems.map((item) => {
                        const rate = Number(item.unit_price) || Number(item.menu_items?.price) || 0;
                        return (
                          <div
                            key={item.id}
                            className="p-2 rounded flex items-center justify-between text-xs"
                            style={{ backgroundColor: "var(--paper-dim)", border: "1px solid var(--hairline)" }}
                          >
                            <div>
                              <div className="font-semibold" style={{ color: "var(--ink)" }}>
                                {item.menu_items?.name || "Dish"}
                              </div>
                              <div className="font-receipt text-[11px]" style={{ color: "var(--ink-soft)" }}>
                                ₹{rate} each
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="font-receipt font-bold" style={{ color: "var(--ink)" }}>
                                ₹{item.qty * rate}
                              </span>

                              {/* Permission check: Edit order allowed? */}
                              {canEditOrders ? (
                                <div className="flex items-center gap-1 bg-white px-1 py-0.5 rounded border" style={{ borderColor: "var(--hairline)" }}>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQty(item.id, item.qty - 1)}
                                    className="w-5 h-5 flex items-center justify-center font-bold text-xs hover:bg-stone-100 rounded cursor-pointer"
                                    title="Decrease quantity"
                                  >
                                    -
                                  </button>
                                  <span className="font-receipt font-bold px-1 text-xs">{item.qty}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQty(item.id, item.qty + 1)}
                                    className="w-5 h-5 flex items-center justify-center font-bold text-xs hover:bg-stone-100 rounded cursor-pointer"
                                    title="Increase quantity"
                                  >
                                    +
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItem(item.id)}
                                    className="w-5 h-5 flex items-center justify-center text-xs text-red-600 hover:bg-red-50 rounded ml-1 cursor-pointer"
                                    title="Remove dish"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded"
                                  style={{ backgroundColor: "var(--paper)", color: "var(--ink-soft)", border: "1px solid var(--hairline)" }}
                                  title="Edit locked by restaurant owner"
                                >
                                  {item.qty}× (locked)
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Tax & Grand Total Breakdown */}
                    <div className="mt-4 pt-3 border-t border-dashed space-y-1 text-xs font-receipt" style={{ borderColor: "var(--hairline)" }}>
                      <div className="flex justify-between" style={{ color: "var(--ink-soft)" }}>
                        <span>Subtotal</span>
                        <span>₹{subtotal.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between" style={{ color: "var(--ink-soft)" }}>
                        <span>CGST (2.5%)</span>
                        <span>₹{cgst.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between" style={{ color: "var(--ink-soft)" }}>
                        <span>SGST (2.5%)</span>
                        <span>₹{sgst.toFixed(2)}</span>
                      </div>
                      <div className="pt-2 flex justify-between items-baseline border-t border-stone-300">
                        <span className="font-heading text-sm font-bold" style={{ color: "var(--ink)" }}>
                          Total payable
                        </span>
                        <span className="font-heading text-2xl font-bold" style={{ color: "var(--rust)" }}>
                          ₹{grandTotal.toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center" style={{ color: "var(--ink-soft)" }}>
                    <p className="text-xs">No active orders on Table {selectedTable}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderTable(selectedTable);
                        setIsNewOrderOpen(true);
                      }}
                      className="mt-3 px-4 py-2 text-xs font-bold rounded cursor-pointer"
                      style={{ backgroundColor: "var(--rust)", color: "var(--rust-text)", borderRadius: "4px" }}
                    >
                      + Create order for Table {selectedTable}
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 mt-4 border-t border-dashed space-y-2" style={{ borderColor: "var(--hairline)" }}>
                {chitItems.length > 0 && (
                  <>
                    {/* Add Dishes Button (guarded) */}
                    {canEditOrders ? (
                      <button
                        type="button"
                        onClick={() => {
                          setOrderTable(selectedTable);
                          setIsNewOrderOpen(true);
                        }}
                        className="w-full py-2 text-xs font-semibold rounded cursor-pointer"
                        style={{
                          backgroundColor: "var(--paper-dim)",
                          color: "var(--rust)",
                          border: "1px solid var(--hairline)",
                        }}
                      >
                        + Add dishes to Table {selectedTable}
                      </button>
                    ) : (
                      <div
                        className="w-full py-2 text-center text-xs rounded"
                        style={{
                          backgroundColor: "var(--paper-dim)",
                          color: "var(--ink-soft)",
                          border: "1px solid var(--hairline)",
                        }}
                      >
                        Add dishes locked (owner permission required)
                      </div>
                    )}

                    {/* Table Joining & Moving Controls */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsMergeOpen((prev) => !prev);
                          setIsTransferOpen(false);
                        }}
                        className="py-2 px-2 text-xs font-semibold rounded cursor-pointer flex items-center justify-center gap-1.5 border transition-colors"
                        style={{
                          backgroundColor: isMergeOpen ? "#FEF3C7" : "var(--paper-dim)",
                          borderColor: isMergeOpen ? "#D97706" : "var(--hairline)",
                          color: isMergeOpen ? "#92400E" : "var(--ink)",
                        }}
                        title="Join two tables together into a single combined order"
                      >
                        <span>🔗</span>
                        <span>{isMergeOpen ? "Close Join" : "Join Table"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsTransferOpen((prev) => !prev);
                          setIsMergeOpen(false);
                        }}
                        className="py-2 px-2 text-xs font-semibold rounded cursor-pointer flex items-center justify-center gap-1.5 border transition-colors"
                        style={{
                          backgroundColor: isTransferOpen ? "#DBEAFE" : "var(--paper-dim)",
                          borderColor: isTransferOpen ? "#2563EB" : "var(--hairline)",
                          color: isTransferOpen ? "#1E40AF" : "var(--ink)",
                        }}
                        title="Transfer this order to another table"
                      >
                        <span>🔄</span>
                        <span>{isTransferOpen ? "Close Shift" : "Shift Table"}</span>
                      </button>
                    </div>

                    {/* Inline Merge / Join Drawer */}
                    {isMergeOpen && (
                      <div className="p-3 rounded-xl border bg-amber-50/70 space-y-2 border-amber-200 shadow-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-amber-950 flex items-center gap-1">
                            <span>🔗</span>
                            <span>Join Another Table with Table {selectedTable}</span>
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-800 leading-snug">
                          Select the table to join (e.g. for big groups/parties). Both tables will be combined into a single group bill.
                        </p>
                        <div className="flex items-center gap-2">
                          <select
                            value={mergeSourceTable}
                            onChange={(e) => setMergeSourceTable(e.target.value)}
                            className="flex-1 py-1.5 px-2 text-xs rounded-lg border bg-white font-semibold"
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
                            className="px-3 py-1.5 text-xs font-bold rounded-lg text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-50 cursor-pointer shadow-xs whitespace-nowrap"
                          >
                            {isMerging ? "Joining..." : "Join Tables"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Inline Shift / Transfer Drawer */}
                    {isTransferOpen && (
                      <div className="p-3 rounded-xl border bg-blue-50/70 space-y-2 border-blue-200 shadow-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-blue-950 flex items-center gap-1">
                            <span>🔄</span>
                            <span>Shift Table {selectedTable} to New Table</span>
                          </span>
                        </div>
                        <p className="text-[11px] text-blue-800 leading-snug">
                          Move this customer party and active ticket to another table. Table {selectedTable} will be marked available.
                        </p>
                        <div className="flex items-center gap-2">
                          <select
                            value={transferTargetTable}
                            onChange={(e) => setTransferTargetTable(e.target.value)}
                            className="flex-1 py-1.5 px-2 text-xs rounded-lg border bg-white font-semibold"
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
                            className="px-3 py-1.5 text-xs font-bold rounded-lg text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 cursor-pointer shadow-xs whitespace-nowrap"
                          >
                            {isMerging ? "Moving..." : "Shift Order"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Print Receipt */}
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="w-full py-2.5 rounded text-xs font-semibold cursor-pointer"
                      style={{
                        backgroundColor: "var(--dark-surface)",
                        color: "var(--paper)",
                        borderRadius: "4px",
                      }}
                    >
                      Print thermal receipt
                    </button>

                    {/* Settle Bill (Clearly weighted primary action) */}
                    <button
                      type="button"
                      onClick={() => handleSettleTable(selectedTable)}
                      disabled={isSettling}
                      className="w-full py-3 rounded text-xs font-bold text-white cursor-pointer shadow-sm transition-transform active:scale-95"
                      style={{
                        backgroundColor: "var(--sage)",
                        borderRadius: "5px",
                      }}
                    >
                      {isSettling ? "Settling..." : "Mark paid and free table"}
                    </button>

                    {/* Void Order (guarded by canDeleteOrders) */}
                    {activeOrder && (
                      canDeleteOrders ? (
                        <button
                          type="button"
                          onClick={() => handleVoidOrder(activeOrder.id, selectedTable)}
                          className="w-full py-2 text-xs font-semibold rounded cursor-pointer transition-colors"
                          style={{
                            backgroundColor: "transparent",
                            color: "var(--brick)",
                            border: "1px solid var(--hairline)",
                          }}
                        >
                          Void order and free table
                        </button>
                      ) : (
                        <div
                          className="w-full py-1.5 text-center text-[11px] rounded"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          Void locked (owner permission required)
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: New Order Creation */}
      {isNewOrderOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(34, 29, 22, 0.45)" }}
          onClick={() => setIsNewOrderOpen(false)}
        >
          <div
            className="w-full max-w-md p-6 rounded"
            style={{
              backgroundColor: "var(--paper)",
              border: "1px solid var(--hairline)",
              boxShadow: "var(--shadow-lg)",
              borderRadius: "5px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start pb-3 mb-4 border-b border-dashed" style={{ borderColor: "var(--hairline)" }}>
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
                className="p-1 text-sm font-bold cursor-pointer"
                style={{ color: "var(--ink-soft)" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrderSubmit} className="space-y-3.5 text-xs">
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

              {/* Cart Summary & Dispatch Button */}
              {(() => {
                const cartList = Object.values(quickCart).filter((c) => c.qty > 0);
                const totalQty = cartList.reduce((sum, c) => sum + c.qty, 0);
                const totalAmount = cartList.reduce((sum, c) => sum + c.qty * c.item.price, 0);

                return (
                  <div className="pt-3 border-t border-dashed space-y-2.5" style={{ borderColor: "var(--hairline)" }}>
                    <div className="flex justify-between items-baseline text-xs font-bold px-1">
                      <span className="text-stone-600">
                        {totalQty > 0 ? `${totalQty} item(s) selected` : "No items added"}
                      </span>
                      <span className="font-receipt text-sm" style={{ color: "var(--rust)" }}>
                        Total: ₹{totalAmount.toLocaleString("en-IN")}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsNewOrderOpen(false)}
                        className="px-3.5 py-2 rounded text-xs font-medium cursor-pointer text-stone-600 hover:bg-stone-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={totalQty === 0 || isQuickSubmitting}
                        className="px-4 py-2 rounded text-xs font-bold cursor-pointer transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
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
    </div>
  );
}
