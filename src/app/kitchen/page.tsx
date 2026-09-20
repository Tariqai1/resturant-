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

export default function KitchenDisplayPage() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "preparing">("all");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ name: string; role: string } | null>(null);
  const previousOrderCountRef = useRef(0);

  // Sound chime
  const playChime = useCallback(() => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1046.5, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1318.5, audioCtx.currentTime + 0.08);

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
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Error loading tickets");
    } finally {
      setIsLoading(false);
    }
  }, [playChime]);

  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());

  useEffect(() => {
    let isMounted = true;
    fetch("/api/kitchen")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        const fetched: KitchenOrder[] = data.orders || [];
        fetched.sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());
        setOrders(fetched);
        previousOrderCountRef.current = fetched.length;
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setErrorMessage(err instanceof Error ? err.message : "Error loading tickets");
        setIsLoading(false);
      });

    fetch("/api/dashboard")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.user) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => undefined);

    const interval = setInterval(() => {
      fetchKitchenTickets();
      setCurrentTime(Date.now());
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [fetchKitchenTickets]);

  const handleSetPrepTime = async (orderId: string, minutes: number) => {
    try {
      const res = await fetch("/api/kitchen", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, prepMinutes: minutes, setBy: "chef" }),
      });
      if (res.ok) {
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
      }
    } catch {
      // ignore
    }
  };

  // Advance single item status
  async function bumpItem(itemId: string, currentStatus: "pending" | "preparing" | "served") {
    if (currentStatus === "served") return;
    const nextStatus = currentStatus === "pending" ? "preparing" : "served";

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

  const activeOrders = orders.filter((ord) => {
    const unservedItems = ord.order_items.filter((it) => it.item_status !== "served");
    if (unservedItems.length === 0) return false;
    if (filter === "pending") return unservedItems.some((it) => it.item_status === "pending");
    if (filter === "preparing") return unservedItems.some((it) => it.item_status === "preparing");
    return true;
  });

  const isKitchenRole = currentUser?.role === "kitchen";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: "var(--dark-surface)",
        color: "#FAF6EC",
      }}
    >
      {/* Wall-Display Top Bar: High contrast, large type for distance glanceability */}
      <header
        className="px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-md border-b"
        style={{
          backgroundColor: "#1B1712",
          borderColor: "rgba(220, 209, 183, 0.18)",
        }}
      >
        <div className="flex items-center gap-4">
          {!isKitchenRole && (
            <Link
              href="/"
              className="px-3 py-1.5 rounded text-xs font-semibold"
              style={{
                backgroundColor: "rgba(220, 209, 183, 0.12)",
                color: "var(--paper)",
                border: "1px solid rgba(220, 209, 183, 0.2)",
              }}
            >
              Floor desk
            </Link>
          )}

          <div>
            <div className="text-xs font-semibold" style={{ color: "var(--rust)" }}>
              Kitchen display system
            </div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-white">
              Live Order Rail ({activeOrders.length} active slips)
            </h1>
          </div>
        </div>

        {/* Filters and Controls */}
        <div className="flex items-center gap-3">
          <div
            className="flex p-1 rounded border text-xs font-semibold"
            style={{
              backgroundColor: "#14110D",
              borderColor: "rgba(220, 209, 183, 0.2)",
            }}
          >
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="px-3 py-1 rounded cursor-pointer transition-colors"
              style={{
                backgroundColor: filter === "all" ? "var(--rust)" : "transparent",
                color: filter === "all" ? "#FFFFFF" : "#A89D8C",
              }}
            >
              All ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("pending")}
              className="px-3 py-1 rounded cursor-pointer transition-colors"
              style={{
                backgroundColor: filter === "pending" ? "var(--rust)" : "transparent",
                color: filter === "pending" ? "#FFFFFF" : "#A89D8C",
              }}
            >
              New orders
            </button>
            <button
              type="button"
              onClick={() => setFilter("preparing")}
              className="px-3 py-1 rounded cursor-pointer transition-colors"
              style={{
                backgroundColor: filter === "preparing" ? "var(--rust)" : "transparent",
                color: filter === "preparing" ? "#FFFFFF" : "#A89D8C",
              }}
            >
              Cooking
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="px-3 py-1.5 rounded text-xs font-semibold cursor-pointer border"
            style={{
              backgroundColor: "rgba(220, 209, 183, 0.1)",
              borderColor: "rgba(220, 209, 183, 0.2)",
              color: soundEnabled ? "var(--sage)" : "#786E5E",
            }}
            title={soundEnabled ? "Mute bell chime" : "Enable bell chime"}
          >
            {soundEnabled ? "Chime on" : "Muted"}
          </button>

          <div className="flex items-center gap-2 pl-3 border-l border-stone-800">
            <span className="text-xs font-medium" style={{ color: "#A89D8C" }}>
              {currentUser?.name || "Chef"}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-2.5 py-1 rounded text-xs cursor-pointer hover:bg-stone-800"
              style={{ color: "#D1C7B7" }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Order Rail: Large Cards Read Easily from 4 Feet Away */}
      <main className="flex-1 p-6 overflow-x-auto space-y-6">
        {isLoading && (
          <div className="p-12 text-center text-xs font-medium" style={{ color: "#A89D8C" }}>
            Connecting to kitchen rail...
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded text-xs" style={{ backgroundColor: "#381B15", color: "#FCA5A5", border: "1px solid var(--brick)" }}>
            {errorMessage}
          </div>
        )}

        {!isLoading && activeOrders.length === 0 && (
          <div className="text-center py-28 space-y-2">
            <h2 className="font-heading text-3xl font-bold" style={{ color: "var(--paper)" }}>
              Kitchen rail clear
            </h2>
            <p className="text-xs" style={{ color: "#9E9382" }}>
              All tickets cooked and dispatched. Standing by for floor orders.
            </p>
          </div>
        )}

        {/* Grid of Authentic Kitchen Paper Slip Tickets (Oldest first) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
          {activeOrders.map((order) => {
            const elapsed = getElapsedMinutes(order.opened_at);
            const isLate = elapsed >= 12;
            const isAttention = elapsed >= 8 && !isLate;
            const isAllPreparing = order.order_items.every((it) => it.item_status === "preparing");

            // Urgency color coding
            const urgencyBorder = isLate
              ? "border-t-4 border-t-[#A8412F]"
              : isAttention
              ? "border-t-4 border-t-[#C1652C]"
              : "border-t-4 border-t-[#5B7A55]";

            const timerColor = isLate ? "text-[#A8412F]" : isAttention ? "text-[#C1652C]" : "text-[#5B7A55]";

            return (
              <div
                key={order.id}
                className={`rounded flex flex-col justify-between shadow-lg overflow-hidden ${urgencyBorder}`}
                style={{
                  backgroundColor: "var(--paper)",
                  borderRight: "1px solid var(--hairline)",
                  borderBottom: "1px solid var(--hairline)",
                  borderLeft: "1px solid var(--hairline)",
                  borderRadius: "3px",
                  color: "var(--ink)",
                }}
              >
                <div>
                  {/* Ticket Header: Large Table Number & Item Ready Counter */}
                  <div
                    className="p-3.5 border-b border-dashed flex items-baseline justify-between"
                    style={{
                      backgroundColor: "var(--paper-dim)",
                      borderColor: "var(--hairline)",
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
                      <strong className="font-heading text-3xl font-bold tracking-tight block mt-0.5" style={{ color: "var(--ink)" }}>
                        Table {order.restaurant_tables?.table_number || "T--"}
                      </strong>
                    </div>

                    <div className="text-right font-receipt">
                      <span className={`text-sm font-bold ${timerColor}`}>
                        {elapsed >= 1440
                          ? `${Math.floor(elapsed / 1440)}d ${Math.floor((elapsed % 1440) / 60)}h`
                          : elapsed >= 60
                          ? `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`
                          : `${elapsed} min`}
                      </span>
                      <div className="text-[10px] text-stone-500 mt-0.5">
                        {isLate ? "Overdue" : isAttention ? "Priority" : "Fresh"}
                      </div>
                    </div>
                  </div>

                  {/* Kitchen Master 1-Tap Prep Time Countdown Setter */}
                  <div
                    className="px-3 py-2 border-b border-dashed flex items-center justify-between gap-1 text-[11px]"
                    style={{ backgroundColor: "var(--paper-dim)", borderColor: "var(--hairline)" }}
                  >
                    <div className="flex items-center gap-1 font-semibold text-stone-700">
                      <span>⏳</span>
                      <span>Target:</span>
                      {order.prepEstimate ? (
                        <span className="font-bold px-1.5 py-0.2 rounded font-mono text-[10px]" style={{ backgroundColor: "var(--rust)", color: "var(--rust-text)" }}>
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
                              ? "shadow-sm ring-1 ring-amber-600"
                              : "bg-white hover:bg-stone-100 text-stone-700 border border-stone-300"
                          }`}
                          style={
                            order.prepEstimate?.minutes === mins
                              ? { backgroundColor: "var(--rust)", color: "var(--rust-text)" }
                              : undefined
                          }
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

                      return (
                        <div
                          key={item.id}
                          className="p-2.5 rounded-lg flex items-center justify-between gap-2 transition-all border"
                          style={{
                            backgroundColor: isItemServed
                              ? "#F4F7F4"
                              : isItemCooking
                              ? "#EFF6FF"
                              : "var(--paper)",
                            borderColor: isItemServed
                              ? "#A3CFBB"
                              : isItemCooking
                              ? "#93C5FD"
                              : "var(--hairline)",
                            opacity: isItemServed ? 0.65 : 1,
                          }}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={item.menu_items?.is_veg ? "veg-indicator" : "nonveg-indicator"} />
                            <div className="min-w-0">
                              <div className="font-bold text-sm truncate" style={{ color: "var(--ink)" }}>
                                {item.qty}× {item.menu_items?.name || "Dish"}
                              </div>
                              {item.notes && (
                                <div className="text-[11px] font-sans font-semibold mt-0.5 text-red-700">
                                  Note: {item.notes}
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
                                className="px-2.5 py-1 rounded text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-transform cursor-pointer shadow-xs flex items-center gap-1"
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
                                className="px-2.5 py-1 rounded text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-transform cursor-pointer shadow-sm flex items-center gap-1 animate-pulse"
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
                    backgroundColor: "var(--paper-dim)",
                    borderColor: "var(--hairline)",
                  }}
                >
                  {!isAllPreparing && (
                    <button
                      type="button"
                      onClick={() => bumpOrder(order.id, "preparing")}
                      className="flex-1 h-11 rounded text-xs font-bold text-white cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                      style={{
                        backgroundColor: "var(--ink-blue)",
                        borderRadius: "4px",
                      }}
                    >
                      <span>🍳</span>
                      <span>Start all cooking</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => bumpOrder(order.id, "served")}
                    className="flex-1 h-11 rounded text-xs font-bold text-white cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                    style={{
                      backgroundColor: "var(--sage)",
                      borderRadius: "4px",
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
    </div>
  );
}
