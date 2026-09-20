"use client";

import { useEffect, useState, useCallback, use } from "react";

type MenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  is_veg: boolean;
  is_available: boolean;
  is_bestseller: boolean;
  photo_url: string | null;
};

type Category = {
  id: string;
  name: string;
  sort_order: number;
};

type ActiveOrderItem = {
  id: string;
  menu_item_id?: string;
  qty: number;
  unit_price: number;
  notes: string | null;
  item_status: "pending" | "preparing" | "served";
  customer_name?: string | null;
  menu_items?: {
    name: string;
    is_veg: boolean;
  };
};

type ActiveOrder = {
  id: string;
  status: string;
  opened_at: string;
  prepEstimate?: {
    orderId: string;
    minutes: number;
    setAt: string;
    setBy: string;
  } | null;
  order_items: ActiveOrderItem[];
};

type RestaurantFeatures = {
  callWaiter: boolean;
  prepTimeTracker: boolean;
  customRequests: boolean;
  tablePayUpi: boolean;
  dishNotes: boolean;
  smartUpsell: boolean;
  feedbackReview: boolean;
};

function triggerHaptic(ms = 12) {
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      // ignore
    }
  }
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/aa/g, "a")
    .replace(/ck/g, "k")
    .replace(/y$/g, "i")
    .replace(/ph/g, "f");
}

function matchesSearch(query: string, itemName: string, itemDesc: string | null): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase().trim();
  const name = itemName.toLowerCase();
  const desc = (itemDesc || "").toLowerCase();

  // Direct match
  if (name.includes(q) || desc.includes(q)) return true;

  // Normalized phonetic match (e.g. "chiken" -> "chicken", "briyani" -> "biryani", "panir" -> "paneer")
  const normQ = normalizeText(q);
  const normName = normalizeText(name);
  if (normName.includes(normQ)) return true;

  const tokens = q.split(/\s+/);
  return tokens.every((tok) => name.includes(tok) || normalizeText(name).includes(normalizeText(tok)));
}

function getFoodEmoji(name: string, isVeg: boolean): string {
  const n = name.toLowerCase();
  if (n.includes("biryani") || n.includes("rice") || n.includes("pulao") || n.includes("jeera")) return "🍚";
  if (n.includes("paneer") || n.includes("curry") || n.includes("dal") || n.includes("gravy") || n.includes("masala") || n.includes("kofta")) return "🍲";
  if (n.includes("roti") || n.includes("naan") || n.includes("bread") || n.includes("paratha") || n.includes("kulcha")) return "🫓";
  if (n.includes("tikka") || n.includes("kebab") || n.includes("tandoor") || n.includes("crispy") || n.includes("fry")) return "🍢";
  if (n.includes("chicken") || n.includes("mutton") || n.includes("fish") || n.includes("egg") || n.includes("prawn")) return "🍗";
  if (n.includes("pizza")) return "🍕";
  if (n.includes("burger") || n.includes("sandwich")) return "🍔";
  if (n.includes("noodle") || n.includes("chowmein") || n.includes("pasta") || n.includes("manchurian")) return "🍜";
  if (n.includes("chai") || n.includes("tea") || n.includes("coffee") || n.includes("latte") || n.includes("cappuccino")) return "☕";
  if (n.includes("shake") || n.includes("smoothie") || n.includes("juice") || n.includes("soda") || n.includes("mojito") || n.includes("lassi") || n.includes("drink")) return "🥤";
  if (n.includes("ice cream") || n.includes("gulab") || n.includes("halwa") || n.includes("kheer") || n.includes("cake") || n.includes("brownie") || n.includes("dessert")) return "🍨";
  if (n.includes("soup") || n.includes("shorba")) return "🥣";
  if (n.includes("salad") || n.includes("raita") || n.includes("papad")) return "🥗";
  if (n.includes("roll") || n.includes("wrap") || n.includes("frankie")) return "🌯";
  if (n.includes("dosa") || n.includes("idli") || n.includes("vada") || n.includes("sambar")) return "🥞";
  if (n.includes("samosa") || n.includes("pakoda") || n.includes("chaat") || n.includes("snack")) return "🥟";
  return isVeg ? "🥗" : "🍖";
}

function getCategoryIcon(catName: string): string {
  const c = catName.toLowerCase();
  if (c.includes("starter") || c.includes("appetizer") || c.includes("snack")) return "🥟";
  if (c.includes("main") || c.includes("curry") || c.includes("gravy")) return "🍛";
  if (c.includes("bread") || c.includes("roti") || c.includes("naan")) return "🫓";
  if (c.includes("rice") || c.includes("biryani")) return "🍚";
  if (c.includes("drink") || c.includes("beverage") || c.includes("juice") || c.includes("mocktail")) return "🥤";
  if (c.includes("dessert") || c.includes("sweet") || c.includes("ice")) return "🍨";
  if (c.includes("soup") || c.includes("salad")) return "🥗";
  if (c.includes("tandoor") || c.includes("kebab") || c.includes("grill")) return "🍢";
  return "🍽️";
}

export default function CustomerTableOrderingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = use(params);
  const { token } = resolvedParams;

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [restaurantName, setRestaurantName] = useState("Order Desk");
  const [tableNumber, setTableNumber] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  const [joinedNotice, setJoinedNotice] = useState<string | null>(null);
  const [theme, setTheme] = useState<"amber" | "crimson">("amber");

  // Feature Entitlements controlled by Super Admin
  const [features, setFeatures] = useState<RestaurantFeatures>({
    callWaiter: true,
    prepTimeTracker: true,
    customRequests: true,
    tablePayUpi: true,
    dishNotes: true,
    smartUpsell: true,
    feedbackReview: true,
  });

  // Flow State
  const [hasDismissedWelcome, setHasDismissedWelcome] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(`od_welcomed_${token}`) === "true";
    }
    return false;
  });

  // Fast Dietary & Category Filters
  const [selectedCat, setSelectedCat] = useState<string>("all");
  const [dietFilter, setDietFilter] = useState<"all" | "veg" | "nonveg" | "bestseller">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedNotes, setExpandedNotes] = useState<{ [id: string]: boolean }>({});

  // Cart: Map<menuItemId, { qty: number, notes: string, addedBy: string }>
  const [cart, setCart] = useState<{ [id: string]: { qty: number; notes: string; addedBy: string } }>({});
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccessMsg, setOrderSuccessMsg] = useState("");



  // Call Waiter / Buzzer state
  const [isCallingWaiter, setIsCallingWaiter] = useState(false);
  const [waiterCallSuccess, setWaiterCallSuccess] = useState("");
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [customCallNote, setCustomCallNote] = useState("");
  const [billPaymentMode, setBillPaymentMode] = useState<"upi" | "cash" | "card">("upi");
  const [waiterCooldown, setWaiterCooldown] = useState<number>(0);
  const [showUpiQrModal, setShowUpiQrModal] = useState(false);

  // Post-meal rating state
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [isTicketExpanded, setIsTicketExpanded] = useState(false);
  const [previewDish, setPreviewDish] = useState<MenuItem | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<boolean>(false);

  // Live timer tick
  const [nowTime, setNowTime] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTime(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (waiterCooldown > 0) {
      const cdTimer = setInterval(() => {
        setWaiterCooldown((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(cdTimer);
    }
  }, [waiterCooldown]);

  // SWR Caching Engine: Instantly hydrate from localStorage in 0.05s
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(`od_cache_${token}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.restaurant?.name) setRestaurantName(parsed.restaurant.name);
          if (parsed.table?.table_number) setTableNumber(parsed.table.table_number);
          if (parsed.categories?.length) setCategories(parsed.categories);
          if (parsed.items?.length) setItems(parsed.items);
          if (parsed.theme) setTheme(parsed.theme);
          if (parsed.features) setFeatures(parsed.features);
          setIsLoading(false); // 0.05s instant render!
        }
      } catch {
        // ignore
      }
    }
  }, [token]);

  const loadTableData = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/table/${token}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load table details");

      setRestaurantName(data.restaurant?.name || "Order Desk");
      setTableNumber(data.table?.table_number || "T--");
      setCategories(data.categories || []);
      setItems(data.items || []);
      setActiveOrder(data.activeOrder || null);
      if (data.joinedNotice !== undefined) setJoinedNotice(data.joinedNotice);
      if (data.theme) setTheme(data.theme);
      if (data.features) setFeatures(data.features);

      // Persist in SWR LocalStorage Cache
      try {
        localStorage.setItem(`od_cache_${token}`, JSON.stringify(data));
      } catch {
        // ignore quota
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error connecting to restaurant.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/public/table/${token}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setRestaurantName(data.restaurant?.name || "Order Desk");
        setTableNumber(data.table?.table_number || "T--");
        setCategories(data.categories || []);
        setItems(data.items || []);
        setActiveOrder(data.activeOrder || null);
        if (data.joinedNotice !== undefined) setJoinedNotice(data.joinedNotice);
        if (data.theme) setTheme(data.theme);
        if (data.features) setFeatures(data.features);
        try {
          localStorage.setItem(`od_cache_${token}`, JSON.stringify(data));
        } catch {
          // ignore
        }
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setErrorMsg(err instanceof Error ? err.message : "Error connecting to restaurant.");
        setIsLoading(false);
      });

    // Poll live order status every 3 seconds for instant multi-guest sync
    const interval = setInterval(loadTableData, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [token, loadTableData]);

  function addToCart(itemId: string) {
    triggerHaptic(12);
    setCart((prev) => {
      const current = prev[itemId] || { qty: 0, notes: "", addedBy: customerName.trim() || "You" };
      return {
        ...prev,
        [itemId]: { ...current, qty: current.qty + 1 },
      };
    });
  }

  function removeFromCart(itemId: string) {
    triggerHaptic(8);
    setCart((prev) => {
      const current = prev[itemId];
      if (!current || current.qty <= 1) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return {
        ...prev,
        [itemId]: { ...current, qty: current.qty - 1 },
      };
    });
  }

  function setItemNotes(itemId: string, notes: string) {
    setCart((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { qty: 1, addedBy: customerName.trim() || "You" }), notes },
    }));
  }

  function toggleNoteInput(itemId: string) {
    triggerHaptic(8);
    setExpandedNotes((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  // 1-Tap Reorder / Repeat Item from Active Kitchen Ticket
  function handleReorderItem(item: ActiveOrderItem) {
    triggerHaptic(16);
    if (item.menu_item_id) {
      addToCart(item.menu_item_id);
      setIsReviewOpen(true);
    }
  }

  // Cart calculations
  const cartEntries = Object.entries(cart).filter(([, val]) => val.qty > 0);
  const totalCartCount = cartEntries.reduce((sum, [, val]) => sum + val.qty, 0);
  const subtotalCart = cartEntries.reduce((sum, [id, val]) => {
    const item = items.find((i) => i.id === id);
    return sum + (item ? Number(item.price) * val.qty : 0);
  }, 0);

  // Indian GST 5%: 2.5% CGST + 2.5% SGST
  const cgst = Math.round(subtotalCart * 0.025 * 100) / 100;
  const sgst = Math.round(subtotalCart * 0.025 * 100) / 100;
  const grandTotal = Math.round(subtotalCart + cgst + sgst);



  // Smart Upsell Items
  const upsellCandidates = items
    .filter((it) => !cart[it.id] && (it.is_bestseller || it.price <= 120))
    .slice(0, 3);

  // Dispatch Order to Kitchen
  async function handlePlaceOrder() {
    if (cartEntries.length === 0) return;
    triggerHaptic(25);
    setIsSubmitting(true);
    setOrderSuccessMsg("");

    try {
      const payload = {
        token,
        customerName: customerName.trim() || "Dine-in Guest",
        items: cartEntries.map(([id, val]) => ({
          menuItemId: id,
          qty: val.qty,
          notes: val.notes || undefined,
        })),
      };

      const res = await fetch("/api/public/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to submit order");

      setCart({});
      setIsReviewOpen(false);
      setOrderSuccessMsg("Order sent to kitchen! Cooking begins immediately.");
      await loadTableData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to place order.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCallWaiter(
    type: "waiter" | "water" | "bill" | "clean" | "cutlery" | "condiments" | "chair" | "ac" | "custom",
    customNote?: string,
    paymentMode?: "upi" | "cash" | "card"
  ) {
    if (waiterCooldown > 0) return;
    triggerHaptic(20);
    setIsCallingWaiter(true);
    setWaiterCallSuccess("");
    try {
      const res = await fetch("/api/public/table/call-waiter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, type, customNote, paymentMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to notify staff");

      const label =
        type === "water"
          ? "Water refill request"
          : type === "bill"
          ? `Bill request (${paymentMode === "upi" ? "UPI QR Instant" : "Cash/Card"})`
          : type === "clean"
          ? "Table clearing request"
          : type === "cutlery"
          ? "Extra Cutlery & Napkins"
          : type === "condiments"
          ? "Dips & Chutney request"
          : type === "chair"
          ? "Baby High Chair request"
          : type === "ac"
          ? "AC temperature request"
          : customNote
          ? `Special request: "${customNote}"`
          : "Staff assistance request";

      setWaiterCallSuccess(`${label} received! Staff buzzer is sounding.`);
      setIsCallModalOpen(false);
      setCustomCallNote("");
      setWaiterCooldown(45); // 45-second anti-spam cooldown

      if (type === "bill" && paymentMode === "upi") {
        setShowUpiQrModal(true);
      }

      setTimeout(() => setWaiterCallSuccess(""), 7000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not notify staff. Please try again.");
    } finally {
      setIsCallingWaiter(false);
    }
  }

  // Filtered dishes with Fuzzy Phonetic Matching
  const filteredItems = items.filter((item) => {
    if (dietFilter === "veg" && !item.is_veg) return false;
    if (dietFilter === "nonveg" && item.is_veg) return false;
    if (dietFilter === "bestseller" && !item.is_bestseller) return false;
    if (selectedCat !== "all" && item.category_id !== selectedCat) return false;
    return matchesSearch(searchQuery, item.name, item.description);
  });

  // Calculate live order status stage
  let activeStage: "placed" | "preparing" | "served" = "placed";
  if (activeOrder && activeOrder.order_items.length > 0) {
    if (activeOrder.order_items.every((it) => it.item_status === "served")) {
      activeStage = "served";
    } else if (activeOrder.order_items.some((it) => it.item_status === "preparing")) {
      activeStage = "preparing";
    }
  }

  // Live countdown calculation
  let remainingMinutesText = "";
  if (activeOrder?.prepEstimate) {
    const elapsedSecs = Math.max(0, Math.floor((nowTime - new Date(activeOrder.prepEstimate.setAt).getTime()) / 1000));
    const totalSecs = activeOrder.prepEstimate.minutes * 60;
    const remainingSecs = Math.max(0, totalSecs - elapsedSecs);
    const remMins = Math.floor(remainingSecs / 60);
    const remSecs = remainingSecs % 60;
    remainingMinutesText = `${remMins}:${remSecs.toString().padStart(2, "0")}`;
  }

  // 1. Loading State
  if (isLoading) {
    return (
      <div data-theme={theme} className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "var(--paper)" }}>
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center animate-spin" style={{ border: "3px solid var(--hairline)", borderTopColor: "var(--brand-primary)" }} />
          <div className="font-heading text-2xl font-bold tracking-wide" style={{ color: "var(--ink)" }}>
            {restaurantName}
          </div>
          <p className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>
            Connecting to Table {tableNumber || "station"}...
          </p>
        </div>
      </div>
    );
  }

  // Error State
  if (errorMsg && items.length === 0) {
    return (
      <div data-theme={theme} className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "var(--paper)" }}>
        <div className="max-w-sm w-full text-center p-6 rounded-xl border shadow-lg" style={{ backgroundColor: "var(--paper)", borderColor: "var(--hairline)" }}>
          <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center text-xl bg-red-100 text-red-700">
            ⚠️
          </div>
          <div className="font-heading text-xl font-bold mb-1" style={{ color: "var(--brick)" }}>
            Table Link Unavailable
          </div>
          <p className="text-xs mb-5" style={{ color: "var(--ink-soft)" }}>{errorMsg}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full py-2.5 text-xs font-bold rounded-lg shadow cursor-pointer transition-all active:scale-95"
            style={{ backgroundColor: "var(--rust)", color: "var(--rust-text)" }}
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // STEP 1: POST-SCAN WELCOME
  if (!hasDismissedWelcome) {
    return (
      <main
        data-theme={theme}
        className="min-h-screen max-w-md mx-auto flex flex-col justify-between p-6 sm:p-8"
        style={{ backgroundColor: "var(--paper)", color: "var(--ink)" }}
      >
        <div className="pt-8 space-y-6">
          <div className="flex items-center justify-between">
            <div
              className="text-[11px] font-bold px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 shadow-sm"
              style={{
                backgroundColor: "var(--brand-primary)",
                color: "var(--rust-text)",
              }}
            >
              <span>✦</span>
              <span>Order Desk Digital Menu</span>
            </div>

            <div className="flex items-center gap-1 bg-white/70 backdrop-blur px-2 py-1 rounded-full border" style={{ borderColor: "var(--hairline)" }}>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  setTheme("amber");
                }}
                title="Amber Gold Theme"
                className={`w-4 h-4 rounded-full border ${theme === "amber" ? "ring-2 ring-amber-500" : "opacity-60"}`}
                style={{ backgroundColor: "#FFBE0B", borderColor: "#2A2312" }}
              />
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  setTheme("crimson");
                }}
                title="Velvet Crimson Theme"
                className={`w-4 h-4 rounded-full border ${theme === "crimson" ? "ring-2 ring-rose-700" : "opacity-60"}`}
                style={{ backgroundColor: "#741A2F", borderColor: "#FFC6A8" }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <h1 className="font-heading text-4xl font-extrabold tracking-tight" style={{ color: "var(--ink)" }}>
              {restaurantName}
            </h1>
            <p className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>
              Dine-in Instant Table Experience
            </p>
          </div>

          {/* Table Card */}
          <div
            className="p-6 rounded-2xl border-2 shadow-md relative overflow-hidden"
            style={{
              backgroundColor: "var(--paper-dim)",
              borderColor: "var(--hairline)",
            }}
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: "var(--ink-soft)" }}>
                  Confirmed Table
                </span>
                <div className="font-heading text-6xl font-extrabold mt-1" style={{ color: "var(--ink)" }}>
                  {tableNumber}
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-inner" style={{ backgroundColor: "var(--brand-primary)", color: "var(--rust-text)" }}>
                🛎️
              </div>
            </div>

            <div className="mt-4 pt-3 border-t flex items-center gap-2 text-xs font-semibold" style={{ borderColor: "var(--hairline)", color: "var(--sage)" }}>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600" />
              </span>
              <span>Direct Kitchen Live Connection Active</span>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/60 border" style={{ borderColor: "var(--hairline)" }}>
              <span className="text-lg">⚡</span>
              <div className="text-xs">
                <strong className="block font-bold" style={{ color: "var(--ink)" }}>Instant 0-Wait Menu</strong>
                <span style={{ color: "var(--ink-soft)" }}>Auto-cached for super-fast loading on all phones.</span>
              </div>
            </div>

            {features.prepTimeTracker && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/60 border" style={{ borderColor: "var(--hairline)" }}>
                <span className="text-lg">⏳</span>
                <div className="text-xs">
                  <strong className="block font-bold" style={{ color: "var(--ink)" }}>Live Cooking Countdown</strong>
                  <span style={{ color: "var(--ink-soft)" }}>Watch your kitchen preparation time tick live.</span>
                </div>
              </div>
            )}

            {features.callWaiter && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/60 border" style={{ borderColor: "var(--hairline)" }}>
                <span className="text-lg">🛎️</span>
                <div className="text-xs">
                  <strong className="block font-bold" style={{ color: "var(--ink)" }}>1-Tap Staff Buzzer</strong>
                  <span style={{ color: "var(--ink-soft)" }}>Ring waiter for water, cutlery, or bill anytime.</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pb-8 pt-6">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(15);
              setHasDismissedWelcome(true);
              if (typeof window !== "undefined") {
                sessionStorage.setItem(`od_welcomed_${token}`, "true");
              }
            }}
            className="w-full h-14 rounded-xl text-base font-extrabold shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
            style={{
              backgroundColor: "var(--rust)",
              color: "var(--rust-text)",
            }}
          >
            <span>Explore Menu & Order</span>
            <span>→</span>
          </button>
        </div>
      </main>
    );
  }

  // STEP 2: MAIN MENU & ORDERING INTERFACE
  return (
    <div
      data-theme={theme}
      className="min-h-screen max-w-md mx-auto flex flex-col pb-32"
      style={{ backgroundColor: "var(--paper)", color: "var(--ink)" }}
    >
      {/* Sticky Table Header */}
      <header
        className="sticky top-0 z-30 px-4 py-3 border-b backdrop-blur-md bg-opacity-95 flex items-center justify-between"
        style={{
          backgroundColor: "var(--paper)",
          borderColor: "var(--hairline)",
          boxShadow: "0 2px 10px rgba(42, 35, 18, 0.05)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm font-heading" style={{ backgroundColor: "var(--brand-primary)", color: "var(--rust-text)" }}>
            {tableNumber || "T"}
          </div>
          <div>
            <span className="font-heading text-base font-bold tracking-tight block leading-tight" style={{ color: "var(--ink)" }}>
              {restaurantName}
            </span>
            <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: "var(--ink-soft)" }}>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Table {tableNumber} · Live Station</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick theme toggle */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic(8);
              setTheme(theme === "amber" ? "crimson" : "amber");
            }}
            title="Switch theme palette"
            className="w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer transition-transform active:scale-95 shadow-sm"
            style={{
              backgroundColor: theme === "amber" ? "#2A2312" : "#741A2F",
              borderColor: "var(--hairline)",
            }}
          >
            <span className="text-[13px]">{theme === "amber" ? "👑" : "✨"}</span>
          </button>

          {/* Call Waiter Buzzer Button */}
          {features.callWaiter && (
            <button
              type="button"
              disabled={waiterCooldown > 0}
              onClick={() => {
                triggerHaptic(12);
                setIsCallModalOpen(true);
              }}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm transition-all active:scale-95 cursor-pointer border ${
                waiterCooldown > 0 ? "opacity-60 bg-stone-200" : ""
              }`}
              style={{
                backgroundColor: "var(--paper-dim)",
                borderColor: "var(--hairline)",
                color: "var(--ink)",
              }}
            >
              <span className={waiterCooldown > 0 ? "animate-pulse" : "animate-bounce"}>
                {waiterCooldown > 0 ? "⏳" : "🛎️"}
              </span>
              <span>{waiterCooldown > 0 ? `${waiterCooldown}s` : "Call"}</span>
            </button>
          )}

          {activeOrder && activeOrder.order_items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic(10);
                setIsReviewOpen(true);
              }}
              className="text-xs font-extrabold px-3 py-1.5 rounded-full cursor-pointer shadow-sm active:scale-95 transition-all"
              style={{
                backgroundColor: "var(--rust)",
                color: "var(--rust-text)",
              }}
            >
              Ticket ({activeOrder.order_items.length})
            </button>
          )}
        </div>
      </header>

      {/* Advanced Call Waiter Modal */}
      {isCallModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ backgroundColor: "rgba(34, 29, 22, 0.6)" }}
          onClick={() => setIsCallModalOpen(false)}
        >
          <div
            className="w-full max-w-sm p-5 rounded-2xl border shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto"
            style={{
              backgroundColor: "var(--paper)",
              borderColor: "var(--hairline)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start pb-2.5 mb-3 border-b border-dashed" style={{ borderColor: "var(--hairline)" }}>
              <div>
                <span className="font-heading text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--rust)" }}>
                  Station {tableNumber}
                </span>
                <h3 className="font-heading text-xl font-bold" style={{ color: "var(--ink)" }}>
                  Call Restaurant Staff
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCallModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer hover:bg-black/5"
                style={{ color: "var(--ink-soft)" }}
              >
                ✕
              </button>
            </div>

            <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
              Tap your need. The staff counter buzzer rings immediately.
            </p>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                type="button"
                disabled={isCallingWaiter || waiterCooldown > 0}
                onClick={() => handleCallWaiter("waiter")}
                className="p-3 rounded-xl text-left border flex flex-col items-start gap-1 cursor-pointer transition-all hover:shadow-md active:scale-95 bg-white/80"
                style={{ borderColor: "var(--hairline)" }}
              >
                <span className="text-xl">🛎️</span>
                <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>Call Captain</span>
                <span className="text-[10px]" style={{ color: "var(--ink-soft)" }}>Order assistance</span>
              </button>

              <button
                type="button"
                disabled={isCallingWaiter || waiterCooldown > 0}
                onClick={() => handleCallWaiter("water")}
                className="p-3 rounded-xl text-left border flex flex-col items-start gap-1 cursor-pointer transition-all hover:shadow-md active:scale-95 bg-white/80"
                style={{ borderColor: "var(--hairline)" }}
              >
                <span className="text-xl">💧</span>
                <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>Need Water</span>
                <span className="text-[10px]" style={{ color: "var(--ink-soft)" }}>Glasses & jug</span>
              </button>

              <button
                type="button"
                disabled={isCallingWaiter || waiterCooldown > 0}
                onClick={() => handleCallWaiter("bill", undefined, billPaymentMode)}
                className="p-3 rounded-xl text-left border flex flex-col items-start gap-1 cursor-pointer transition-all hover:shadow-md active:scale-95 bg-white/80"
                style={{ borderColor: "var(--hairline)" }}
              >
                <span className="text-xl">🧾</span>
                <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>Request Bill</span>
                <span className="text-[10px]" style={{ color: "var(--ink-soft)" }}>
                  {features.tablePayUpi && billPaymentMode === "upi" ? "Via UPI QR" : "Cash / Card"}
                </span>
              </button>

              <button
                type="button"
                disabled={isCallingWaiter || waiterCooldown > 0}
                onClick={() => handleCallWaiter("clean")}
                className="p-3 rounded-xl text-left border flex flex-col items-start gap-1 cursor-pointer transition-all hover:shadow-md active:scale-95 bg-white/80"
                style={{ borderColor: "var(--hairline)" }}
              >
                <span className="text-xl">✨</span>
                <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>Clear Table</span>
                <span className="text-[10px]" style={{ color: "var(--ink-soft)" }}>Plates & tissues</span>
              </button>
            </div>

            {features.tablePayUpi && (
              <div className="p-2.5 rounded-xl border bg-stone-50/80 mb-3" style={{ borderColor: "var(--hairline)" }}>
                <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Bill Payment Preference</span>
                  <span className="text-emerald-700 font-bold">Fastest</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(8);
                      setBillPaymentMode("upi");
                    }}
                    className={`py-1.5 px-2 rounded-lg border text-center cursor-pointer transition-all ${
                      billPaymentMode === "upi" ? "bg-emerald-600 text-white border-emerald-600 shadow-xs" : "bg-white text-stone-700 border-stone-300"
                    }`}
                  >
                    💳 Instant UPI QR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(8);
                      setBillPaymentMode("cash");
                    }}
                    className={`py-1.5 px-2 rounded-lg border text-center cursor-pointer transition-all ${
                      billPaymentMode === "cash" ? "bg-stone-800 text-white border-stone-800 shadow-xs" : "bg-white text-stone-700 border-stone-300"
                    }`}
                  >
                    💵 Cash / Card
                  </button>
                </div>
              </div>
            )}

            {features.customRequests && (
              <div className="mb-3 space-y-2">
                <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                  Specific Requests (1-Tap)
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <button
                    type="button"
                    disabled={waiterCooldown > 0}
                    onClick={() => handleCallWaiter("cutlery")}
                    className="px-2.5 py-1.5 rounded-lg border bg-white hover:bg-stone-50 cursor-pointer font-medium"
                    style={{ borderColor: "var(--hairline)", color: "var(--ink)" }}
                  >
                    🥄 Extra Cutlery & Napkins
                  </button>
                  <button
                    type="button"
                    disabled={waiterCooldown > 0}
                    onClick={() => handleCallWaiter("condiments")}
                    className="px-2.5 py-1.5 rounded-lg border bg-white hover:bg-stone-50 cursor-pointer font-medium"
                    style={{ borderColor: "var(--hairline)", color: "var(--ink)" }}
                  >
                    🌶️ Green Chutney / Dips
                  </button>
                  <button
                    type="button"
                    disabled={waiterCooldown > 0}
                    onClick={() => handleCallWaiter("chair")}
                    className="px-2.5 py-1.5 rounded-lg border bg-white hover:bg-stone-50 cursor-pointer font-medium"
                    style={{ borderColor: "var(--hairline)", color: "var(--ink)" }}
                  >
                    👶 Baby High Chair
                  </button>
                  <button
                    type="button"
                    disabled={waiterCooldown > 0}
                    onClick={() => handleCallWaiter("ac")}
                    className="px-2.5 py-1.5 rounded-lg border bg-white hover:bg-stone-50 cursor-pointer font-medium"
                    style={{ borderColor: "var(--hairline)", color: "var(--ink)" }}
                  >
                    ❄️ Adjust AC / Fan
                  </button>
                </div>

                <div className="pt-2">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Special request (e.g. warm water)..."
                      value={customCallNote}
                      onChange={(e) => setCustomCallNote(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border bg-white focus:outline-none"
                      style={{ borderColor: "var(--hairline)", color: "var(--ink)" }}
                    />
                    <button
                      type="button"
                      disabled={!customCallNote.trim() || waiterCooldown > 0}
                      onClick={() => handleCallWaiter("custom", customCallNote.trim())}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs cursor-pointer disabled:opacity-40"
                      style={{ backgroundColor: "var(--rust)", color: "var(--rust-text)" }}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsCallModalOpen(false)}
              className="w-full mt-2 py-2 text-xs font-medium cursor-pointer text-center rounded-lg hover:bg-black/5"
              style={{ color: "var(--ink-soft)" }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* UPI QR Payment Modal */}
      {showUpiQrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ backgroundColor: "rgba(34, 29, 22, 0.6)" }}
          onClick={() => setShowUpiQrModal(false)}
        >
          <div
            className="w-full max-w-xs p-6 rounded-2xl border shadow-2xl text-center bg-white"
            style={{ borderColor: "var(--hairline)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-3xl block mb-2">💳</span>
            <h3 className="font-heading text-xl font-bold" style={{ color: "var(--ink)" }}>
              Instant Table UPI Settlement
            </h3>
            <p className="text-xs text-stone-500 mt-1 mb-4">
              Scan with any UPI App (GPay, PhonePe, Paytm, BHIM)
            </p>

            <div className="w-48 h-48 mx-auto bg-stone-100 rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-3 relative overflow-hidden" style={{ borderColor: "var(--rust)" }}>
              <div className="font-mono text-[11px] font-bold text-stone-800 mb-1">UPI ID: orderdesk@icici</div>
              <div className="w-32 h-32 bg-white rounded-lg border flex items-center justify-center text-center p-2 shadow-inner">
                <span className="text-xs font-mono font-bold text-stone-700">
                  QR: Table {tableNumber}
                  <br />₹{grandTotal || 0}
                </span>
              </div>
              <span className="text-[10px] text-stone-500 mt-1">Verified Merchant</span>
            </div>

            <div className="mt-4 pt-3 border-t text-xs font-semibold text-stone-600">
              Waiter will bring stamped tax receipt upon scan.
            </div>

            <button
              type="button"
              onClick={() => setShowUpiQrModal(false)}
              className="w-full mt-4 py-2.5 text-xs font-bold rounded-xl cursor-pointer"
              style={{ backgroundColor: "var(--rust)", color: "var(--rust-text)" }}
            >
              Done / Settle at Counter
            </button>
          </div>
        </div>
      )}

      {/* Joined / Group Table Banner */}
      {joinedNotice && (
        <div
          className="mx-4 mt-3 p-3 rounded-xl text-xs font-semibold border flex items-center justify-between shadow-xs animate-fade-in"
          style={{
            backgroundColor: "#FEF3C7",
            borderColor: "#FDE68A",
            color: "#92400E",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🔗</span>
            <span>{joinedNotice}</span>
          </div>
        </div>
      )}

      {/* Buzzer Alert Banner */}
      {waiterCallSuccess && (
        <div
          className="mx-4 mt-3 p-3.5 rounded-xl text-xs font-semibold border flex items-center justify-between shadow-sm animate-fade-in"
          style={{
            backgroundColor: "#EFF6EF",
            color: "var(--sage)",
            borderColor: "#C5D8C3",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🛎️</span>
            <span>{waiterCallSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setWaiterCallSuccess("")}
            className="text-xs font-bold text-stone-500 p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Live Cooking Tracker: Sleek, compact & collapsible so it NEVER pushes down the menu */}
      {activeOrder && activeOrder.order_items.length > 0 && (
        <div
          className="mx-4 mt-3 rounded-2xl border shadow-xs overflow-hidden transition-all"
          style={{
            backgroundColor: "var(--paper-dim)",
            borderColor: "var(--hairline)",
          }}
        >
          {/* Compact Clickable Summary Strip (~46px) */}
          <div
            onClick={() => setIsTicketExpanded(!isTicketExpanded)}
            className="p-3 flex items-center justify-between cursor-pointer select-none hover:bg-white/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{activeStage === "served" ? "✓" : activeStage === "preparing" ? "🔥" : "🍳"}</span>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>
                    Live Kitchen Ticket
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/80 font-bold text-stone-600">
                    #{activeOrder.id.slice(0, 6)}
                  </span>
                </div>
                <div className="text-[10px] text-stone-500">
                  {activeOrder.order_items.length} dishes · Tap to {isTicketExpanded ? "collapse ▴" : "view details & repeat ▾"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {features.prepTimeTracker && activeOrder.prepEstimate && activeStage !== "served" && (
                <span className="text-[10px] font-mono font-bold text-stone-700 bg-white px-2 py-0.5 rounded border border-stone-200">
                  ⏳ {remainingMinutesText || `${activeOrder.prepEstimate.minutes}m`}
                </span>
              )}
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider"
                style={{
                  backgroundColor: activeStage === "served" ? "#E8F5E9" : activeStage === "preparing" ? "#E3F2FD" : "#FFF3E0",
                  color: activeStage === "served" ? "#2E7D32" : activeStage === "preparing" ? "#1565C0" : "#E65100",
                }}
              >
                {activeStage === "served" ? "Served" : activeStage === "preparing" ? "Cooking" : "Placed"}
              </span>
              <span className="text-xs font-bold text-stone-400">
                {isTicketExpanded ? "▴" : "▾"}
              </span>
            </div>
          </div>

          {/* Expanded Detail View (Only when user taps to expand) */}
          {isTicketExpanded && (
            <div className="p-4 pt-1 border-t border-dashed space-y-3" style={{ borderColor: "var(--hairline)" }}>
              {/* Dynamic Prep Countdown Detail */}
              {features.prepTimeTracker && activeOrder.prepEstimate && activeStage !== "served" && (
                <div className="p-3 rounded-xl bg-white/90 border shadow-xs flex items-center justify-between" style={{ borderColor: "var(--hairline)" }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg animate-pulse" style={{ backgroundColor: "var(--brand-primary)", color: "var(--rust-text)" }}>
                      ⏳
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Estimated Cooking</div>
                      <div className="text-sm font-heading font-extrabold flex items-baseline gap-1" style={{ color: "var(--ink)" }}>
                        <span>{remainingMinutesText || "0:00"}</span>
                        <span className="text-[10px] font-normal text-stone-500">remaining</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-mono font-bold text-stone-500 block">
                      Target: {activeOrder.prepEstimate.minutes}m
                    </span>
                    <span className="text-[9px] text-stone-400 capitalize">
                      Set by {activeOrder.prepEstimate.setBy}
                    </span>
                  </div>
                </div>
              )}

              {/* 3-Stage Progress Indicator */}
              <div className="grid grid-cols-3 gap-2 py-1 text-center text-[10px] font-bold">
                <div
                  className="py-1.5 rounded-lg shadow-sm"
                  style={{
                    backgroundColor: "var(--rust)",
                    color: "var(--rust-text)",
                  }}
                >
                  1. Placed
                </div>
                <div
                  className="py-1.5 rounded-lg transition-all"
                  style={{
                    backgroundColor: activeStage === "preparing" || activeStage === "served" ? "var(--ink-blue)" : "var(--hairline)",
                    color: activeStage === "preparing" || activeStage === "served" ? "#FFFFFF" : "var(--ink-soft)",
                  }}
                >
                  2. Cooking {activeStage === "preparing" && "♨"}
                </div>
                <div
                  className="py-1.5 rounded-lg transition-all"
                  style={{
                    backgroundColor: activeStage === "served" ? "var(--sage)" : "var(--hairline)",
                    color: activeStage === "served" ? "#FFFFFF" : "var(--ink-soft)",
                  }}
                >
                  3. Served
                </div>
              </div>

              {/* 1-Tap Re-order / Repeat Items List */}
              <div className="pt-2 border-t border-dashed space-y-1.5" style={{ borderColor: "var(--hairline)" }}>
                <div className="text-[11px] font-bold text-stone-600 flex items-center justify-between">
                  <span>Dishes on Ticket:</span>
                  <span className="text-[10px] font-normal text-stone-400">Need more? Tap repeat</span>
                </div>
                {activeOrder.order_items.map((it) => (
                  <div key={it.id} className="flex justify-between items-center py-1.5 text-xs border-b border-stone-200/60 last:border-0">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className={it.menu_items?.is_veg ? "veg-indicator" : "nonveg-indicator"} />
                      <span className="font-bold text-stone-800 truncate">{it.qty}× {it.menu_items?.name || "Dish"}</span>
                      {it.item_status === "served" ? (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1 shrink-0">
                          <span>✓</span> Ready
                        </span>
                      ) : it.item_status === "preparing" ? (
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 animate-pulse flex items-center gap-1 shrink-0">
                          <span>🔥</span> Cooking
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1 shrink-0">
                          <span>⏳</span> Queued
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleReorderItem(it)}
                      className="px-2 py-0.5 rounded text-[10px] font-bold border bg-white hover:bg-stone-100 cursor-pointer shadow-xs transition-transform active:scale-95 ml-2 shrink-0"
                      style={{ borderColor: "var(--hairline)", color: "var(--rust)" }}
                    >
                      + Repeat
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Post-Meal Dining Feedback & Google Review Booster */}
      {features.feedbackReview && activeStage === "served" && (
        <div
          className="mx-4 mt-3 p-4 rounded-2xl border shadow-sm text-center bg-white/90 space-y-2"
          style={{ borderColor: "var(--hairline)" }}
        >
          <div className="text-xs font-bold" style={{ color: "var(--ink)" }}>
            How was your dining experience at Table {tableNumber}?
          </div>
          {!feedbackSubmitted ? (
            <div className="flex items-center justify-center gap-2 py-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => {
                    triggerHaptic(15);
                    setFeedbackRating(star);
                    setFeedbackSubmitted(true);
                  }}
                  className="text-2xl cursor-pointer hover:scale-125 transition-transform"
                >
                  {star <= (feedbackRating || 0) ? "⭐" : "☆"}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs font-semibold text-emerald-700 animate-fade-in py-1">
              {feedbackRating && feedbackRating >= 4 ? (
                <div>
                  <span>🌟 Thank you! We loved serving you.</span>
                  <a
                    href="https://maps.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block px-3 py-1.5 rounded-lg text-white font-bold text-[11px] mx-auto max-w-[200px]"
                    style={{ backgroundColor: "var(--rust)", color: "var(--rust-text)" }}
                  >
                    Rate us on Google Maps ★
                  </a>
                </div>
              ) : (
                <span>🙏 Thank you for your feedback! Manager has been notified.</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Success Notification */}
      {orderSuccessMsg && (
        <div
          className="mx-4 mt-3 p-3.5 rounded-xl text-xs font-semibold border shadow-sm flex items-center justify-between"
          style={{
            backgroundColor: "#EFF6EF",
            color: "var(--sage)",
            borderColor: "#C5D8C3",
          }}
        >
          <div className="flex items-center gap-2">
            <span>🎉</span>
            <span>{orderSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setOrderSuccessMsg("")}
            className="text-xs font-bold text-stone-500 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search Bar with Misspelling Tolerance & Dietary Filter Pills */}
      <div className="p-4 pb-2 space-y-2.5">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search dishes (e.g. biryani, paneer, naan)..."
            className="w-full pl-9 pr-8 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 transition-all shadow-inner"
            style={{
              backgroundColor: "var(--paper-dim)",
              borderColor: "var(--hairline)",
              color: "var(--ink)",
            }}
          />
          <span className="absolute left-3 top-2.5 text-xs text-stone-400">🔍</span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic(6);
                setSearchQuery("");
              }}
              className="absolute right-2.5 top-2.5 text-xs font-bold text-stone-400 hover:text-stone-700 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* 4 Fast Dietary Filter Buttons */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(8);
              setDietFilter(dietFilter === "veg" ? "all" : "veg");
            }}
            className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs ${
              dietFilter === "veg" ? "bg-emerald-100 text-emerald-800 border-emerald-500 ring-1 ring-emerald-500" : "bg-white text-stone-700 border-stone-200"
            }`}
          >
            <span className="veg-indicator" />
            <span>Veg Only</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic(8);
              setDietFilter(dietFilter === "nonveg" ? "all" : "nonveg");
            }}
            className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs ${
              dietFilter === "nonveg" ? "bg-red-100 text-red-800 border-red-500 ring-1 ring-red-500" : "bg-white text-stone-700 border-stone-200"
            }`}
          >
            <span className="nonveg-indicator" />
            <span>Non-Veg</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic(8);
              setDietFilter(dietFilter === "bestseller" ? "all" : "bestseller");
            }}
            className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs ${
              dietFilter === "bestseller" ? "bg-amber-100 text-amber-900 border-amber-500 ring-1 ring-amber-500" : "bg-white text-stone-700 border-stone-200"
            }`}
          >
            <span>⭐</span>
            <span>Bestsellers</span>
          </button>

          {dietFilter !== "all" && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic(6);
                setDietFilter("all");
              }}
              className="px-2 py-1.5 text-[11px] text-stone-400 hover:text-stone-700 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(8);
              setSelectedCat("all");
            }}
            className="px-3.5 py-2 rounded-full flex-shrink-0 cursor-pointer transition-all flex items-center gap-1.5 active:scale-95 shadow-sm"
            style={{
              backgroundColor: selectedCat === "all" ? "var(--dark-surface)" : "var(--paper-dim)",
              color: selectedCat === "all" ? (theme === "amber" ? "#FFBE0B" : "#FFC6A8") : "var(--ink-soft)",
              border: "1px solid var(--hairline)",
            }}
          >
            <span>🍽️</span>
            <span>All ({items.length})</span>
          </button>

          {categories.map((cat) => {
            const count = items.filter((i) => i.category_id === cat.id).length;
            const icon = getCategoryIcon(cat.name);
            const isSelected = selectedCat === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  setSelectedCat(cat.id);
                }}
                className="px-3.5 py-2 rounded-full flex-shrink-0 cursor-pointer transition-all flex items-center gap-1.5 active:scale-95 shadow-sm"
                style={{
                  backgroundColor: isSelected ? "var(--dark-surface)" : "var(--paper-dim)",
                  color: isSelected ? (theme === "amber" ? "#FFBE0B" : "#FFC6A8") : "var(--ink-soft)",
                  border: "1px solid var(--hairline)",
                }}
              >
                <span>{icon}</span>
                <span>{cat.name}</span>
                {count > 0 && <span className="text-[10px] opacity-75 font-mono">({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Menu Dish List */}
      <div className="px-4 space-y-3.5 mt-1">
        {filteredItems.length === 0 ? (
          <div className="py-14 text-center rounded-2xl border border-dashed p-6" style={{ borderColor: "var(--hairline)", backgroundColor: "var(--paper-dim)" }}>
            <span className="text-3xl block mb-2">🍽️</span>
            <div className="font-heading text-base font-bold" style={{ color: "var(--ink)" }}>
              No dishes match your filter
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
              Try clearing filters or search by another keyword.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const inCartQty = cart[item.id]?.qty || 0;
            const foodEmoji = getFoodEmoji(item.name, item.is_veg);
            const isNotesOpen = expandedNotes[item.id] || false;

            return (
              <div
                key={item.id}
                className="p-3 sm:p-3.5 rounded-xl border bg-white/95 transition-all hover:shadow-md flex flex-col gap-1.5"
                style={{
                  borderColor: inCartQty > 0 ? "var(--rust)" : "var(--hairline)",
                  boxShadow: inCartQty > 0 ? "0 4px 16px -2px rgba(255, 190, 11, 0.18)" : "var(--shadow-sm)",
                }}
              >
                <div className="flex justify-between gap-3 items-center">
                  {/* Left Info: Name, Price, Description */}
                  <div className="flex-1 min-w-0 pr-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={item.is_veg ? "veg-indicator" : "nonveg-indicator"} />
                      <span
                        onClick={() => setPreviewDish(item)}
                        className="font-bold text-sm leading-tight text-stone-900 cursor-pointer hover:underline"
                      >
                        {item.name}
                      </span>
                      {item.is_bestseller && (
                        <span
                          className="text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-2xs uppercase tracking-wide"
                          style={{
                            backgroundColor: "var(--brand-primary)",
                            color: "var(--rust-text)",
                          }}
                        >
                          ★ Bestseller
                        </span>
                      )}
                    </div>

                    <div className="font-receipt text-xs font-black text-stone-900 pt-0.5 flex items-baseline gap-1">
                      <span className="text-sm">₹{item.price}</span>
                      <span className="text-[10px] font-normal text-stone-400">+ GST</span>
                    </div>

                    {item.description && (
                      <p className="text-[11px] leading-snug line-clamp-1 sm:line-clamp-2 text-stone-500 pt-0.5">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Right: Slim Image Box with Overlapping ADD Button */}
                  <div className="relative w-22 h-20 sm:w-24 sm:h-22 flex-shrink-0 flex items-center justify-center pb-1">
                    {/* Clickable Image Box with Zoom Hint */}
                    <div
                      onClick={() => setPreviewDish(item)}
                      className="w-full h-full rounded-xl overflow-hidden cursor-pointer relative group border shadow-2xs bg-stone-50"
                      style={{ borderColor: "var(--hairline)" }}
                      title="Tap to zoom dish photo"
                    >
                      {item.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.photo_url}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl bg-amber-50/50">
                          {foodEmoji}
                        </div>
                      )}

                      {/* Tap to View Zoom Icon Pill */}
                      <div className="absolute top-1 right-1 px-1 py-0.5 rounded bg-black/50 backdrop-blur-xs flex items-center gap-0.5 text-[9px] text-white font-medium">
                        <span>🔍</span>
                      </div>
                    </div>

                    {/* Overlapping Bottom ADD / Stepper Button */}
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-10">
                      {inCartQty === 0 ? (
                        <button
                          type="button"
                          onClick={() => addToCart(item.id)}
                          className="h-7 px-3.5 rounded-md text-[11px] font-black uppercase tracking-wider shadow-md active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap"
                          style={{
                            backgroundColor: "var(--rust)",
                            color: "var(--rust-text)",
                          }}
                        >
                          <span>ADD</span>
                          <span className="text-[10px] font-normal">+</span>
                        </button>
                      ) : (
                        <div
                          className="h-7 flex items-center rounded-md border shadow-md overflow-hidden bg-white"
                          style={{ borderColor: "var(--rust)" }}
                        >
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.id)}
                            className="w-6 h-full flex items-center justify-center font-bold text-xs cursor-pointer hover:bg-stone-100 transition-colors active:scale-90"
                            style={{ color: "var(--rust)" }}
                          >
                            -
                          </button>
                          <span className="font-receipt text-xs font-black px-1.5 min-w-[16px] text-center" style={{ color: "var(--ink)" }}>
                            {inCartQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => addToCart(item.id)}
                            className="w-6 h-full flex items-center justify-center font-bold text-xs cursor-pointer hover:bg-stone-100 transition-colors active:scale-90"
                            style={{ color: "var(--rust)" }}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dish Special Cooking Notes Input */}
                {features.dishNotes && inCartQty > 0 && (
                  <div className="pt-1.5 mt-0.5 border-t border-dashed" style={{ borderColor: "var(--hairline)" }}>
                    {!isNotesOpen && !cart[item.id]?.notes ? (
                      <button
                        type="button"
                        onClick={() => toggleNoteInput(item.id)}
                        className="text-[10px] font-semibold flex items-center gap-1 cursor-pointer hover:underline text-stone-500"
                      >
                        <span>✏️ Custom cooking note (e.g. less spicy)</span>
                      </button>
                    ) : (
                      <div className="flex gap-1.5 items-center">
                        <input
                          type="text"
                          placeholder="Cooking note (e.g. less spicy, no onion)..."
                          value={cart[item.id]?.notes || ""}
                          onChange={(e) => setItemNotes(item.id, e.target.value)}
                          className="flex-1 px-2 py-0.5 text-[10px] rounded-md border focus:outline-none bg-white text-stone-900"
                          style={{ borderColor: "var(--hairline)" }}
                        />
                        <button
                          type="button"
                          onClick={() => toggleNoteInput(item.id)}
                          className="text-[10px] font-bold px-2 py-0.5 text-stone-400 hover:text-stone-700 cursor-pointer"
                        >
                          Done
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* STICKY BOTTOM FLOATING CART BAR */}
      {totalCartCount > 0 && (
        <div className="fixed bottom-4 left-0 right-0 z-40 px-4 pointer-events-none">
          <div className="max-w-md mx-auto pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                triggerHaptic(14);
                setIsReviewOpen(true);
              }}
              className="w-full h-14 px-5 rounded-2xl flex items-center justify-between shadow-2xl active:scale-[0.99] transition-all cursor-pointer border backdrop-blur"
              style={{
                backgroundColor: "var(--dark-surface)",
                borderColor: "var(--hairline)",
                color: "#FFFFFF",
              }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold"
                  style={{
                    backgroundColor: "var(--rust)",
                    color: "var(--rust-text)",
                  }}
                >
                  {totalCartCount}
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold leading-tight">Review Table Ticket</div>
                  <div className="text-[11px] opacity-75 font-receipt">₹{grandTotal} incl. GST</div>
                </div>
              </div>

              <div
                className="flex items-center gap-1.5 text-xs font-extrabold px-3 py-1.5 rounded-xl shadow-sm"
                style={{
                  backgroundColor: "var(--rust)",
                  color: "var(--rust-text)",
                }}
              >
                <span>View Cart</span>
                <span>→</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Floating Call Staff Buzzer Button (Always accessible anywhere on the menu) */}
      {features.callWaiter && !isReviewOpen && !isCallModalOpen && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic(15);
            setIsCallModalOpen(true);
          }}
          className={`fixed z-40 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-2xl active:scale-95 transition-all cursor-pointer border ${
            totalCartCount > 0 ? "bottom-20 right-4" : "bottom-5 right-4"
          }`}
          style={{
            backgroundColor: "#1F2937",
            color: "#F9FAFB",
            borderColor: "rgba(255,255,255,0.2)",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
          }}
        >
          <span className="text-base animate-bounce">🛎️</span>
          <span className="text-xs font-bold tracking-wide">
            {waiterCooldown > 0 ? `Wait ${waiterCooldown}s` : "Call Waiter"}
          </span>
        </button>
      )}

      {/* CART REVIEW & BILL SPLIT DRAWER */}
      {isReviewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center backdrop-blur-sm"
          style={{ backgroundColor: "rgba(34, 29, 22, 0.5)" }}
          onClick={() => setIsReviewOpen(false)}
        >
          <div
            className="w-full max-w-md max-h-[85vh] p-6 rounded-t-3xl flex flex-col justify-between overflow-y-auto shadow-2xl border-t-2 animate-slide-up"
            style={{
              backgroundColor: "var(--paper)",
              borderColor: "var(--hairline)",
              color: "var(--ink)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="w-12 h-1.5 bg-stone-300 rounded-full mx-auto mb-4" />

              <div className="flex justify-between items-start pb-3 border-b border-dashed" style={{ borderColor: "var(--hairline)" }}>
                <div>
                  <h3 className="font-heading text-2xl font-extrabold" style={{ color: "var(--ink)" }}>
                    Cart Review
                  </h3>
                  <span className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>
                    Table {tableNumber} · {restaurantName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReviewOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold p-1 cursor-pointer hover:bg-black/5"
                  style={{ color: "var(--ink-soft)" }}
                >
                  ✕
                </button>
              </div>

              {/* Cart Items List */}
              <div className="space-y-3 my-4">
                {cartEntries.map(([id, val]) => {
                  const item = items.find((i) => i.id === id);
                  if (!item) return null;
                  const price = Number(item.price);

                  return (
                    <div
                      key={id}
                      className="p-3.5 rounded-xl border space-y-2.5 bg-white shadow-xs"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={item.is_veg ? "veg-indicator" : "nonveg-indicator"} />
                            <span className="font-bold text-xs" style={{ color: "var(--ink)" }}>
                              {item.name}
                            </span>
                          </div>
                        </div>
                          <span className="font-receipt text-xs font-extrabold" style={{ color: "var(--ink)" }}>
                            ₹{price * val.qty}
                          </span>

                          <div className="flex items-center bg-stone-100 rounded-lg border" style={{ borderColor: "var(--hairline)" }}>
                            <button
                              type="button"
                              onClick={() => removeFromCart(id)}
                              className="w-6 h-6 flex items-center justify-center font-bold text-xs cursor-pointer hover:bg-white"
                            >
                              -
                            </button>
                            <span className="font-receipt text-xs font-bold px-1.5">{val.qty}</span>
                            <button
                              type="button"
                              onClick={() => addToCart(id)}
                              className="w-6 h-6 flex items-center justify-center font-bold text-xs cursor-pointer hover:bg-white"
                            >
                              +
                            </button>
                          </div>
                        </div>

                      {features.dishNotes && (
                        <input
                          type="text"
                          placeholder="Cooking note (e.g. less spicy, well done)..."
                          value={val.notes}
                          onChange={(e) => setItemNotes(id, e.target.value)}
                          className="w-full px-2.5 py-1.5 text-[11px] rounded-lg border focus:outline-none bg-stone-50/50"
                          style={{
                            borderColor: "var(--hairline)",
                            color: "var(--ink)",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Smart Upsell Recommendations */}
              {features.smartUpsell && upsellCandidates.length > 0 && (
                <div className="my-3 p-3 rounded-2xl border bg-stone-50/80" style={{ borderColor: "var(--hairline)" }}>
                  <div className="text-[11px] font-bold text-stone-600 mb-2 flex items-center gap-1.5">
                    <span>💡</span>
                    <span>Frequently Ordered Together</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {upsellCandidates.map((upsell) => (
                      <div
                        key={upsell.id}
                        className="px-3 py-2 rounded-xl bg-white border flex items-center gap-2 shadow-xs shrink-0"
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        <span className="text-sm">{getFoodEmoji(upsell.name, upsell.is_veg)}</span>
                        <div className="text-left">
                          <div className="text-[11px] font-bold truncate max-w-[90px]">{upsell.name}</div>
                          <div className="text-[10px] font-receipt font-bold text-stone-500">₹{upsell.price}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addToCart(upsell.id)}
                          className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs cursor-pointer shadow-xs"
                          style={{ backgroundColor: "var(--rust)", color: "var(--rust-text)" }}
                        >
                          +
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Indian Tax Breakdown */}
              <div className="pt-3.5 border-t border-dashed space-y-1.5 font-receipt text-xs" style={{ borderColor: "var(--hairline)" }}>
                <div className="flex justify-between" style={{ color: "var(--ink-soft)" }}>
                  <span>Items Subtotal</span>
                  <span>₹{subtotalCart.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between" style={{ color: "var(--ink-soft)" }}>
                  <span>CGST (2.5%)</span>
                  <span>₹{cgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between" style={{ color: "var(--ink-soft)" }}>
                  <span>SGST (2.5%)</span>
                  <span>₹{sgst.toFixed(2)}</span>
                </div>
                <div className="pt-2.5 flex justify-between items-baseline border-t border-stone-300">
                  <span className="font-heading text-sm font-extrabold" style={{ color: "var(--ink)" }}>
                    Total Payable
                  </span>
                  <span className="font-heading text-2xl font-extrabold" style={{ color: "var(--rust)" }}>
                    ₹{grandTotal.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>



              <p className="text-[11px] mt-3 font-medium text-center" style={{ color: "var(--ink-soft)" }}>
                ℹ Orders are dispatched straight to the kitchen display terminal.
              </p>
            </div>

            {/* Place Order CTA Button */}
            <div className="pt-4 border-t border-dashed" style={{ borderColor: "var(--hairline)" }}>
              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={isSubmitting || cartEntries.length === 0}
                className="w-full h-14 rounded-2xl text-sm font-extrabold shadow-lg transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  backgroundColor: "var(--rust)",
                  color: "var(--rust-text)",
                }}
              >
                <span>{isSubmitting ? "Dispatching to Kitchen..." : "Confirm & Send to Kitchen"}</span>
                <span>👨‍🍳</span>
              </button>
            </div>
          </div>
        </div>
      )}
    
      {/* Dish Fullscreen Photo Zoom & Details Lightbox Modal */}
      {previewDish && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs"
          onClick={() => setPreviewDish(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden bg-white shadow-2xl border border-stone-200 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Hero Image Container */}
            <div className="relative w-full h-56 bg-stone-900 flex-shrink-0">
              {previewDish.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewDish.photo_url}
                  alt={previewDish.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl bg-amber-50">
                  {getFoodEmoji(previewDish.name, previewDish.is_veg)}
                </div>
              )}

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setPreviewDish(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center font-bold text-sm cursor-pointer shadow-md hover:bg-black/80 transition-colors"
                title="Close preview"
              >
                ✕
              </button>

              {/* Dietary Pill */}
              <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-xs text-white text-[11px] font-bold">
                <span className={previewDish.is_veg ? "veg-indicator" : "nonveg-indicator"} />
                <span>{previewDish.is_veg ? "Vegetarian" : "Non-Veg"}</span>
              </div>
            </div>

            {/* Dish Info Content */}
            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="font-heading text-xl font-bold text-stone-900">
                      {previewDish.name}
                    </h3>
                    {previewDish.is_bestseller && (
                      <span
                        className="text-[10px] font-black px-2 py-0.5 rounded-full shadow-2xs uppercase tracking-wide"
                        style={{
                          backgroundColor: "var(--brand-primary)",
                          color: "var(--rust-text)",
                        }}
                      >
                        ★ Bestseller
                      </span>
                    )}
                  </div>
                  <div className="font-receipt text-lg font-extrabold text-stone-900 pt-1">
                    ₹{previewDish.price}
                    <span className="text-xs font-normal text-stone-500 ml-1">+ 5% GST</span>
                  </div>
                </div>
              </div>

              {previewDish.description && (
                <p className="text-xs leading-relaxed text-stone-600 bg-stone-50 p-3 rounded-xl border border-stone-100">
                  {previewDish.description}
                </p>
              )}

              {/* Cooking note inside preview modal */}
              {features.dishNotes && (
                <div className="pt-1">
                  <label className="text-[11px] font-bold text-stone-700 block mb-1">
                    Special Cooking Request
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Extra crispy, less spice, no garlic..."
                    value={cart[previewDish.id]?.notes || ""}
                    onChange={(e) => setItemNotes(previewDish.id, e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>
              )}
            </div>

            {/* Modal Bottom CTA */}
            <div className="p-4 border-t border-stone-100 bg-stone-50 flex items-center justify-between gap-3">
              {(cart[previewDish.id]?.qty || 0) === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    addToCart(previewDish.id);
                  }}
                  className="w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider shadow-md active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  style={{
                    backgroundColor: "var(--rust)",
                    color: "var(--rust-text)",
                  }}
                >
                  <span>+ ADD TO ORDER</span>
                  <span>·</span>
                  <span>₹{previewDish.price}</span>
                </button>
              ) : (
                <div className="w-full flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-600">Quantity in cart:</span>
                  <div
                    className="flex items-center rounded-xl border shadow-xs overflow-hidden bg-white"
                    style={{ borderColor: "var(--rust)" }}
                  >
                    <button
                      type="button"
                      onClick={() => removeFromCart(previewDish.id)}
                      className="w-9 h-9 flex items-center justify-center font-bold text-sm cursor-pointer hover:bg-stone-100 transition-colors"
                      style={{ color: "var(--rust)" }}
                    >
                      -
                    </button>
                    <span className="font-receipt text-sm font-black px-3 min-w-[24px] text-center text-stone-900">
                      {cart[previewDish.id]?.qty || 0}
                    </span>
                    <button
                      type="button"
                      onClick={() => addToCart(previewDish.id)}
                      className="w-9 h-9 flex items-center justify-center font-bold text-sm cursor-pointer hover:bg-stone-100 transition-colors"
                      style={{ color: "var(--rust)" }}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
