"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

type KitchenOrderItem = {
  id: string;
  menu_item_id: string;
  customer_name: string | null;
  qty: number;
  notes: string | null;
  item_status: "pending" | "preparing" | "served";
  created_at: string;
  menu_items?: {
    name: string;
    is_veg: boolean;
  };
};

type KitchenOrder = {
  id: string;
  table_id: string;
  status: string;
  opened_at: string;
  restaurant_tables?: {
    table_number: string;
  };
  order_items: KitchenOrderItem[];
  prepEstimate?: {
    orderId: string;
    minutes: number;
    setAt: string;
    setBy: string;
  } | null;
};

type TodayStats = {
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  dishesCooked: number;
};

type DayWiseStat = {
  date: string;
  label: string;
  totalOrders: number;
  completedOrders: number;
  totalDishes: number;
};

export default function KitchenDisplayPage() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [todayStats, setTodayStats] = useState<TodayStats>({
    totalOrders: 0,
    activeOrders: 0,
    completedOrders: 0,
    dishesCooked: 0,
  });
  const [dayWiseStats, setDayWiseStats] = useState<DayWiseStat[]>([]);
  const [isDayWiseModalOpen, setIsDayWiseModalOpen] = useState(false);
  const [highlightDish, setHighlightDish] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "preparing">("all");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ name: string; role: string } | null>(null);
  const previousOrderCountRef = useRef(0);
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());

  // Web Audio Synthesizer: Alert Chime for New Orders
  const playChime = useCallback(() => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1046.5, audioCtx.currentTime); // C6
      osc.frequency.exponentialRampToValueAtTime(1318.5, audioCtx.currentTime + 0.08); // E6

      gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.65);
    } catch {
      // Audio context might be restricted
    }
  }, [soundEnabled]);

  // Success Chime: Upbeat Chord when Dish/Ticket is Ready
  const playSuccessChime = useCallback(() => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.18, audioCtx.currentTime + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + idx * 0.06 + 0.35);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + idx * 0.06);
        osc.stop(audioCtx.currentTime + idx * 0.06 + 0.38);
      });
    } catch {
      // Audio context might be restricted
    }
  }, [soundEnabled]);

  // Cook Action Click Chime
  const playCookChime = useCallback(() => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.16);
    } catch {
      // Audio context might be restricted
    }
  }, [soundEnabled]);

  const fetchKitchenTickets = useCallback(async (isInitial = false) => {
    try {
      const res = await fetch("/api/kitchen");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch kitchen orders");

      const fetchedOrders: KitchenOrder[] = data.orders || [];
      // Sort oldest first (highest elapsed time on floor)
      fetchedOrders.sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());

      if (!isInitial && fetchedOrders.length > previousOrderCountRef.current) {
        playChime();
      }
      previousOrderCountRef.current = fetchedOrders.length;
      setOrders(fetchedOrders);

      if (data.todayStats) {
        setTodayStats(data.todayStats);
      }
      if (data.dayWiseStats) {
        setDayWiseStats(data.dayWiseStats);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Error loading tickets");
    } finally {
      setIsLoading(false);
    }
  }, [playChime]);

  useEffect(() => {
    let isMounted = true;
    fetchKitchenTickets(true);

    fetch("/api/dashboard")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.user) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => undefined);

    let kitchenInterval: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (kitchenInterval) clearInterval(kitchenInterval);
      kitchenInterval = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          return;
        }
        fetchKitchenTickets();
        setCurrentTime(Date.now());
      }, 3000);
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined") {
        if (document.visibilityState === "visible") {
          fetchKitchenTickets();
          setCurrentTime(Date.now());
          startPolling();
        } else if (kitchenInterval) {
          clearInterval(kitchenInterval);
          kitchenInterval = null;
        }
      }
    };

    startPolling();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      isMounted = false;
      if (kitchenInterval) clearInterval(kitchenInterval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [fetchKitchenTickets]);

  const toggleFullscreen = () => {
    if (typeof document === "undefined") return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleSetPrepTime = async (orderId: string, minutes: number) => {
    playCookChime();
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              prepEstimate: {
                orderId,
                minutes,
                setAt: new Date().toISOString(),
                setBy: "chef",
              },
            }
          : o
      )
    );

    try {
      await fetch("/api/kitchen", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, prepMinutes: minutes, setBy: "chef" }),
      });
    } catch {
      // ignore
    }
  };

  // Advance single item status
  async function bumpItem(itemId: string, currentStatus: "pending" | "preparing" | "served") {
    if (currentStatus === "served") return;
    const nextStatus = currentStatus === "pending" ? "preparing" : "served";

    if (nextStatus === "preparing") {
      playCookChime();
    } else {
      playSuccessChime();
    }

    setOrders((prev) =>
      prev.map((ord) => ({
        ...ord,
        order_items: ord.order_items.map((it) =>
          it.id === itemId ? { ...it, item_status: nextStatus } : it
        ),
      }))
    );

    try {
      const res = await fetch("/api/kitchen", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, nextStatus }),
      });
      if (!res.ok) throw new Error("Status update failed");
    } catch {
      fetchKitchenTickets();
    }
  }

  // Bump entire ticket
  async function bumpOrder(orderId: string, markAllStatus: "preparing" | "served") {
    if (markAllStatus === "served") {
      playSuccessChime();
    } else {
      playCookChime();
    }

    setOrders((prev) =>
      prev.map((ord) =>
        ord.id === orderId
          ? {
              ...ord,
              order_items: ord.order_items.map((it) => ({
                ...it,
                item_status: markAllStatus,
              })),
            }
          : ord
      )
    );

    try {
      const res = await fetch("/api/kitchen", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, markAllStatus }),
      });
      if (!res.ok) throw new Error("Order bump failed");
    } catch {
      fetchKitchenTickets();
    }
  }

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function getElapsedMinutes(openedAt: string): number {
    const diff = currentTime - new Date(openedAt).getTime();
    return Math.max(0, Math.floor(diff / 60000));
  }

  // Filter orders based on status tab and search query
  const activeOrders = orders.filter((ord) => {
    const unservedItems = ord.order_items.filter((it) => it.item_status !== "served");
    if (unservedItems.length === 0) return false;

    // Status filter
    if (filter === "pending" && !unservedItems.some((it) => it.item_status === "pending")) return false;
    if (filter === "preparing" && !unservedItems.some((it) => it.item_status === "preparing")) return false;

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const tableMatch = (ord.restaurant_tables?.table_number || "").toLowerCase().includes(q);
      const itemMatch = ord.order_items.some((it) =>
        (it.menu_items?.name || "").toLowerCase().includes(q)
      );
      if (!tableMatch && !itemMatch) return false;
    }

    return true;
  });

  // Calculate Consolidated Pending Dishes (Batch Cooking Aggregator)
  const pendingDishMap: { [name: string]: { count: number; isVeg: boolean; tables: string[] } } = {};
  activeOrders.forEach((order) => {
    const tableNum = order.restaurant_tables?.table_number || "T--";
    order.order_items.forEach((item) => {
      if (item.item_status !== "served") {
        const name = item.menu_items?.name || "Dish";
        const isVeg = !!item.menu_items?.is_veg;
        if (!pendingDishMap[name]) {
          pendingDishMap[name] = { count: 0, isVeg, tables: [] };
        }
        pendingDishMap[name].count += item.qty;
        if (!pendingDishMap[name].tables.includes(tableNum)) {
          pendingDishMap[name].tables.push(tableNum);
        }
      }
    });
  });
  const consolidatedDishes = Object.entries(pendingDishMap).sort((a, b) => b[1].count - a[1].count);

  const isKitchenRole = currentUser?.role === "kitchen";

  return (
    <div
      className="min-h-screen flex flex-col select-none"
      style={{
        backgroundColor: "var(--dark-surface, #14110D)",
        color: "#FAF6EC",
      }}
    >
      {/* Wall-Display Top Bar: High contrast, large type for distance glanceability */}
      <header
        className="px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30 shadow-xl border-b"
        style={{
          backgroundColor: "#191510",
          borderColor: "rgba(220, 209, 183, 0.15)",
        }}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          {!isKitchenRole && (
            <Link
              href="/"
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:bg-white/10"
              style={{
                backgroundColor: "rgba(220, 209, 183, 0.08)",
                color: "var(--paper, #FAF8F2)",
                border: "1px solid rgba(220, 209, 183, 0.2)",
              }}
            >
              ← Floor Desk
            </Link>
          )}

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-500">
                Kitchen Display System
              </span>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[10px] text-emerald-400 font-mono hidden sm:inline">0-Lag Synced</span>
            </div>
            <h1 className="font-heading text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span>Live Order Rail</span>
              <span className="text-amber-400 text-sm font-sans font-bold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                {activeOrders.length} active slips
              </span>
            </h1>
          </div>
        </div>

        {/* Filters, Search, Sound, Fullscreen, and Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Quick Search Input */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search table or dish..."
              className="px-3 py-1.5 pl-8 rounded-lg text-xs bg-black/40 border border-stone-800 text-white placeholder-stone-500 focus:outline-hidden focus:border-amber-500 w-36 sm:w-44 transition-all"
            />
            <span className="absolute left-2.5 top-2 text-stone-500 text-xs">🔍</span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1.5 text-stone-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Rail Filter Tabs */}
          <div
            className="flex p-0.5 rounded-lg border text-xs font-bold"
            style={{
              backgroundColor: "#100D0A",
              borderColor: "rgba(220, 209, 183, 0.15)",
            }}
          >
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="px-3 py-1 rounded-md cursor-pointer transition-colors"
              style={{
                backgroundColor: filter === "all" ? "var(--rust, #FFBE0B)" : "transparent",
                color: filter === "all" ? "#191510" : "#A89D8C",
              }}
            >
              All ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("pending")}
              className="px-2.5 py-1 rounded-md cursor-pointer transition-colors"
              style={{
                backgroundColor: filter === "pending" ? "var(--rust, #FFBE0B)" : "transparent",
                color: filter === "pending" ? "#191510" : "#A89D8C",
              }}
            >
              New
            </button>
            <button
              type="button"
              onClick={() => setFilter("preparing")}
              className="px-2.5 py-1 rounded-md cursor-pointer transition-colors"
              style={{
                backgroundColor: filter === "preparing" ? "var(--rust, #FFBE0B)" : "transparent",
                color: filter === "preparing" ? "#191510" : "#A89D8C",
              }}
            >
              Cooking
            </button>
          </div>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer border transition-colors"
            style={{
              backgroundColor: "rgba(220, 209, 183, 0.08)",
              borderColor: "rgba(220, 209, 183, 0.2)",
              color: soundEnabled ? "var(--sage, #2E7D32)" : "#786E5E",
            }}
            title={soundEnabled ? "Mute bell chime" : "Enable bell chime"}
          >
            {soundEnabled ? "🔔 Chime ON" : "🔕 Muted"}
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer border transition-colors hover:bg-white/10 hidden sm:inline-flex"
            style={{
              backgroundColor: "rgba(220, 209, 183, 0.08)",
              borderColor: "rgba(220, 209, 183, 0.2)",
              color: "#FAF6EC",
            }}
            title="Toggle TV / Monitor Fullscreen"
          >
            {isFullscreen ? "🗗 Exit" : "⛶ Fullscreen"}
          </button>

          {/* Chef Profile & Sign Out */}
          <div className="flex items-center gap-2 pl-2 border-l border-stone-800">
            <span className="text-xs font-bold text-stone-300">
              {currentUser?.name || "Chef"}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-2 py-1 rounded text-xs cursor-pointer hover:bg-stone-800 text-stone-400 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Day-Wise Metrics & Kitchen Performance Bar */}
      <section
        className="px-4 sm:px-6 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 text-xs"
        style={{
          backgroundColor: "#16120D",
          borderColor: "rgba(220, 209, 183, 0.12)",
        }}
      >
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1.5 font-bold text-stone-300">
            <span className="text-base">📅</span>
            <span>Today&apos;s Velocity:</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-2.5 py-1 rounded-md bg-stone-900/90 border border-stone-800 flex items-center gap-1.5">
              <span className="text-amber-400 font-black text-sm">{todayStats.totalOrders}</span>
              <span className="text-[11px] text-stone-400">Total Orders</span>
            </div>

            <div className="px-2.5 py-1 rounded-md bg-blue-950/40 border border-blue-800/40 flex items-center gap-1.5">
              <span className="text-blue-400 font-black text-sm">{activeOrders.length}</span>
              <span className="text-[11px] text-blue-200">Active Cooking</span>
            </div>

            <div className="px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-800/40 flex items-center gap-1.5">
              <span className="text-emerald-400 font-black text-sm">{todayStats.completedOrders}</span>
              <span className="text-[11px] text-emerald-200">Served Today</span>
            </div>

            <div className="px-2.5 py-1 rounded-md bg-amber-950/30 border border-amber-800/40 flex items-center gap-1.5">
              <span className="text-amber-300 font-black text-sm">{todayStats.dishesCooked}</span>
              <span className="text-[11px] text-amber-200">Dishes Prepared</span>
            </div>
          </div>
        </div>

        {/* Day-Wise Breakdown Modal Trigger */}
        <button
          type="button"
          onClick={() => setIsDayWiseModalOpen(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
        >
          <span>📊</span>
          <span>Day-Wise Orders Report ({dayWiseStats.length} Days)</span>
        </button>
      </section>

      {/* Batch Cooking Fire Counter (Consolidated Kitchen Prep Summary) */}
      {consolidatedDishes.length > 0 && (
        <section
          className="px-4 sm:px-6 py-2.5 border-b flex items-center gap-3 overflow-x-auto select-none"
          style={{
            backgroundColor: "#1E1710",
            borderColor: "rgba(245, 158, 11, 0.2)",
          }}
        >
          <div className="flex items-center gap-1.5 shrink-0 text-xs font-black text-amber-400 uppercase tracking-wider">
            <span>🔥</span>
            <span>Batch Fire Summary:</span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            {consolidatedDishes.map(([name, data]) => {
              const isSelected = highlightDish === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setHighlightDish(isSelected ? null : name)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 border ${
                    isSelected
                      ? "bg-amber-500 text-stone-950 border-amber-400 shadow-md ring-2 ring-amber-300 scale-105"
                      : "bg-black/50 text-stone-200 border-stone-700/80 hover:border-amber-500/60"
                  }`}
                  title={`Click to highlight tickets with ${name} (${data.tables.join(", ")})`}
                >
                  <span className={data.isVeg ? "veg-indicator" : "nonveg-indicator"} />
                  <span className="font-extrabold text-amber-300">{data.count}×</span>
                  <span>{name}</span>
                  <span className="text-[10px] opacity-70 font-mono">[{data.tables.join(",")}]</span>
                </button>
              );
            })}

            {highlightDish && (
              <button
                type="button"
                onClick={() => setHighlightDish(null)}
                className="px-2 py-1 rounded-md text-[11px] font-bold text-amber-400 hover:text-white bg-black/40 border border-stone-700 shrink-0 cursor-pointer"
              >
                Clear Filter ✕
              </button>
            )}
          </div>
        </section>
      )}

      {/* Main Order Rail: Large Cards Read Easily from 4 Feet Away */}
      <main className="flex-1 p-4 sm:p-6 overflow-x-auto space-y-6">
        {isLoading && (
          <div className="p-16 text-center text-xs font-bold text-stone-400 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
            <span>Connecting to live kitchen rail...</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3.5 rounded-lg text-xs font-bold bg-red-950/70 text-red-200 border border-red-700 shadow-lg">
            ⚠️ {errorMessage}
          </div>
        )}

        {!isLoading && activeOrders.length === 0 && (
          <div className="text-center py-24 space-y-3 max-w-md mx-auto">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-3xl shadow-xl">
              ✓
            </div>
            <h2 className="font-heading text-3xl font-bold text-white tracking-tight">
              Kitchen Rail Clear
            </h2>
            <p className="text-xs text-stone-400 leading-relaxed">
              All tickets cooked and dispatched to floor. Standing by for incoming table orders.
            </p>
            <div className="pt-2">
              <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-stone-900 border border-stone-800 text-stone-400">
                Today&apos;s Dispatched: {todayStats.completedOrders} orders • {todayStats.dishesCooked} dishes
              </span>
            </div>
          </div>
        )}

        {/* Grid of Authentic Kitchen Paper Slip Tickets (Oldest first) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
          {activeOrders.map((order) => {
            const elapsed = getElapsedMinutes(order.opened_at);
            const isCritical = elapsed >= 25; // 25+ min is critically overdue
            const isLate = elapsed >= 12 && !isCritical;
            const isAttention = elapsed >= 8 && !isLate && !isCritical;
            const isAllPreparing = order.order_items.every((it) => it.item_status === "preparing");

            const containsHighlightedDish =
              highlightDish &&
              order.order_items.some(
                (it) => it.menu_items?.name === highlightDish && it.item_status !== "served"
              );

            // Urgency color coding & animated priority glow
            const urgencyBorder = isCritical
              ? "border-t-4 border-t-red-600 ring-2 ring-red-500/50 shadow-xl shadow-red-950/50"
              : isLate
              ? "border-t-4 border-t-[#A8412F] shadow-lg"
              : isAttention
              ? "border-t-4 border-t-[#C1652C]"
              : "border-t-4 border-t-[#5B7A55]";

            const timerColor = isCritical
              ? "text-red-600 animate-pulse font-black"
              : isLate
              ? "text-[#A8412F] font-bold"
              : isAttention
              ? "text-[#C1652C] font-bold"
              : "text-[#5B7A55] font-bold";

            return (
              <div
                key={order.id}
                className={`rounded-lg flex flex-col justify-between shadow-xl overflow-hidden transition-all duration-200 ${urgencyBorder} ${
                  containsHighlightedDish
                    ? "ring-4 ring-amber-400 scale-[1.02] shadow-amber-500/20"
                    : highlightDish
                    ? "opacity-60"
                    : ""
                }`}
                style={{
                  backgroundColor: "var(--paper, #FAF8F2)",
                  borderRight: "1px solid var(--hairline, #E8DECA)",
                  borderBottom: "1px solid var(--hairline, #E8DECA)",
                  borderLeft: "1px solid var(--hairline, #E8DECA)",
                  color: "var(--ink, #2A2312)",
                }}
              >
                <div>
                  {/* Ticket Header: Large Table Number & Item Ready Counter */}
                  <div
                    className="p-3.5 border-b border-dashed flex items-baseline justify-between"
                    style={{
                      backgroundColor: isCritical ? "#FEE2E2" : "var(--paper-dim, #F4EFE2)",
                      borderColor: "var(--hairline, #E8DECA)",
                    }}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-stone-600">
                          Order slip
                        </span>
                        {(() => {
                          const readyCount = order.order_items.filter((it) => it.item_status === "served").length;
                          const totalCount = order.order_items.length;
                          const isFullyReady = readyCount === totalCount && totalCount > 0;
                          return (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isFullyReady
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse"
                                  : readyCount > 0
                                  ? "bg-amber-100 text-amber-900 border border-amber-300"
                                  : "bg-stone-200 text-stone-700"
                              }`}
                            >
                              {isFullyReady ? "✓ All Ready" : `${readyCount}/${totalCount} Ready`}
                            </span>
                          );
                        })()}
                      </div>
                      <strong
                        className="font-heading text-3xl font-extrabold tracking-tight block mt-0.5"
                        style={{ color: "var(--ink, #2A2312)" }}
                      >
                        Table {order.restaurant_tables?.table_number || "T--"}
                      </strong>
                    </div>

                    <div className="text-right font-receipt">
                      <span className={`text-sm ${timerColor}`}>
                        {elapsed >= 1440
                          ? `${Math.floor(elapsed / 1440)}d ${Math.floor((elapsed % 1440) / 60)}h`
                          : elapsed >= 60
                          ? `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`
                          : `${elapsed} min`}
                      </span>
                      <div className="text-[10px] text-stone-600 font-bold mt-0.5">
                        {isCritical ? "🚨 OVERDUE" : isLate ? "Overdue" : isAttention ? "Priority" : "Fresh"}
                      </div>
                    </div>
                  </div>

                  {/* Kitchen Master 1-Tap Prep Time Countdown Setter */}
                  <div
                    className="px-3 py-2 border-b border-dashed flex items-center justify-between gap-1 text-[11px]"
                    style={{ backgroundColor: "var(--paper-dim, #F4EFE2)", borderColor: "var(--hairline, #E8DECA)" }}
                  >
                    <div className="flex items-center gap-1 font-semibold text-stone-700">
                      <span>⏳</span>
                      <span>Target:</span>
                      {order.prepEstimate ? (
                        <span
                          className="font-bold px-1.5 py-0.5 rounded font-mono text-[10px]"
                          style={{ backgroundColor: "var(--rust, #FFBE0B)", color: "var(--rust-text, #2A2312)" }}
                        >
                          {order.prepEstimate.minutes}m
                        </span>
                      ) : (
                        <span className="text-stone-400 text-[10px]">Unset</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {[10, 15, 20, 30].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => handleSetPrepTime(order.id, mins)}
                          className={`px-1.5 py-0.5 rounded font-bold font-mono text-[10px] transition-all cursor-pointer ${
                            order.prepEstimate?.minutes === mins
                              ? "shadow-xs ring-1 ring-amber-600 bg-amber-400 text-stone-950"
                              : "bg-white hover:bg-stone-100 text-stone-700 border border-stone-300"
                          }`}
                          title={`Set estimated prep time to ${mins} minutes`}
                        >
                          {mins}m
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ticket Items: Individual Dish-by-Dish Action Bumping */}
                  <div className="p-3.5 space-y-2 font-receipt text-xs">
                    {order.order_items.map((item) => {
                      const isItemServed = item.item_status === "served";
                      const isItemCooking = item.item_status === "preparing";
                      const isItemHighlighted = highlightDish === item.menu_items?.name;

                      return (
                        <div
                          key={item.id}
                          className={`p-2.5 rounded-lg flex items-center justify-between gap-2 transition-all border ${
                            isItemHighlighted ? "ring-2 ring-amber-500 bg-amber-50" : ""
                          }`}
                          style={{
                            backgroundColor: isItemServed
                              ? "#F4F7F4"
                              : isItemCooking
                              ? "#EFF6FF"
                              : isItemHighlighted
                              ? "#FEF3C7"
                              : "var(--paper, #FAF8F2)",
                            borderColor: isItemServed
                              ? "#A3CFBB"
                              : isItemCooking
                              ? "#93C5FD"
                              : isItemHighlighted
                              ? "#F59E0B"
                              : "var(--hairline, #E8DECA)",
                            opacity: isItemServed ? 0.6 : 1,
                          }}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={item.menu_items?.is_veg ? "veg-indicator" : "nonveg-indicator"} />
                            <div className="min-w-0">
                              <div
                                className={`font-bold text-sm truncate ${
                                  isItemServed ? "line-through text-stone-500" : ""
                                }`}
                                style={{ color: isItemServed ? "#78716C" : "var(--ink, #2A2312)" }}
                              >
                                {item.qty}× {item.menu_items?.name || "Dish"}
                              </div>
                              {item.notes && (
                                <div className="text-[11px] font-sans font-bold mt-0.5 text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 inline-block">
                                  ⚠️ Note: {item.notes}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Individual Dish Touch Button for Chef */}
                          <div className="shrink-0 flex items-center gap-1.5">
                            {item.item_status === "pending" && (
                              <button
                                type="button"
                                onClick={() => bumpItem(item.id, "pending")}
                                className="px-2.5 py-1 rounded-md text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-transform cursor-pointer shadow-xs flex items-center gap-1"
                                title="Start cooking this dish"
                              >
                                <span>🍳</span>
                                <span>Cook</span>
                              </button>
                            )}

                            {item.item_status === "preparing" && (
                              <button
                                type="button"
                                onClick={() => bumpItem(item.id, "preparing")}
                                className="px-2.5 py-1 rounded-md text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-transform cursor-pointer shadow-xs flex items-center gap-1 animate-pulse"
                                title="Click when dish is ready for waiter pickup"
                              >
                                <span>🍽️</span>
                                <span>Mark Ready</span>
                              </button>
                            )}

                            {item.item_status === "served" && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 flex items-center gap-1">
                                <span>✓</span>
                                <span>Ready</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Direct Action Bumper (Min 44px target) */}
                <div
                  className="p-3 border-t border-dashed flex items-center gap-2"
                  style={{
                    backgroundColor: "var(--paper-dim, #F4EFE2)",
                    borderColor: "var(--hairline, #E8DECA)",
                  }}
                >
                  {!isAllPreparing && (
                    <button
                      type="button"
                      onClick={() => bumpOrder(order.id, "preparing")}
                      className="flex-1 h-11 rounded-md text-xs font-bold text-white cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1.5 shadow-sm"
                      style={{
                        backgroundColor: "var(--ink-blue, #1976D2)",
                      }}
                    >
                      <span>🍳</span>
                      <span>Start all cooking</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => bumpOrder(order.id, "served")}
                    className="flex-1 h-11 rounded-md text-xs font-bold text-white cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1.5 shadow-sm"
                    style={{
                      backgroundColor: "var(--sage, #2E7D32)",
                    }}
                  >
                    <span>✓</span>
                    <span>Serve entire ticket</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Day-Wise Analytics & Performance Modal */}
      {isDayWiseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="w-full max-w-2xl rounded-2xl border shadow-2xl p-6 space-y-5 overflow-hidden flex flex-col max-h-[90vh]"
            style={{
              backgroundColor: "#1C1712",
              borderColor: "rgba(220, 209, 183, 0.2)",
              color: "#FAF6EC",
            }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <span className="text-xl">📊</span>
                <div>
                  <h3 className="font-heading text-xl font-black tracking-tight text-white">
                    Day-Wise Kitchen Order Analytics
                  </h3>
                  <p className="text-xs text-stone-400">
                    Shift order velocity & dish cooking volume for the last 7 days
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDayWiseModalOpen(false)}
                className="w-8 h-8 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Quick 7-Day Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-stone-900 border border-stone-800 text-center">
                <span className="text-[10px] uppercase font-bold text-stone-400 block">7-Day Total Orders</span>
                <span className="font-heading text-2xl font-black text-amber-400">
                  {dayWiseStats.reduce((sum, d) => sum + d.totalOrders, 0)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-stone-900 border border-stone-800 text-center">
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Total Served</span>
                <span className="font-heading text-2xl font-black text-emerald-400">
                  {dayWiseStats.reduce((sum, d) => sum + d.completedOrders, 0)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-stone-900 border border-stone-800 text-center">
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Dishes Cooked</span>
                <span className="font-heading text-2xl font-black text-blue-400">
                  {dayWiseStats.reduce((sum, d) => sum + d.totalDishes, 0)}
                </span>
              </div>
            </div>

            {/* Day-Wise Breakdown List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {dayWiseStats.map((item) => {
                const completionRate =
                  item.totalOrders > 0
                    ? Math.round((item.completedOrders / item.totalOrders) * 100)
                    : 0;

                return (
                  <div
                    key={item.date}
                    className="p-3.5 rounded-xl border bg-black/40 border-stone-800/80 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-bold text-white">{item.label}</strong>
                        <span className="text-[10px] text-stone-500 font-mono">({item.date})</span>
                      </div>
                      <div className="text-xs text-stone-400 mt-1 flex items-center gap-3">
                        <span>Dishes cooked: <strong className="text-stone-200">{item.totalDishes}</strong></span>
                        <span>•</span>
                        <span>Dispatched: <strong className="text-emerald-400">{item.completedOrders}</strong> / {item.totalOrders}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-heading text-xl font-black text-amber-400">
                        {item.totalOrders} <span className="text-xs font-sans font-normal text-stone-400">Orders</span>
                      </div>
                      <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                        {completionRate}% Completed
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-stone-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsDayWiseModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 text-stone-950 hover:bg-amber-400 cursor-pointer transition-colors"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
