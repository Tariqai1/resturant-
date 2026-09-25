"use client";

import { useEffect, useState, useCallback, useMemo, use } from "react";
import FoodChefLoader from "@/components/FoodChefLoader";
import ScratchCardModal from "@/components/table/ScratchCardModal";
import {
  RestaurantOfferConfig,
  DEFAULT_OFFER_CONFIG,
  RestaurantThemeType,
  RestaurantBrandingConfig,
  DEFAULT_BRANDING_CONFIG,
  SmartUpsellConfig,
  DEFAULT_UPSELL_CONFIG,
} from "@/lib/types/offers";

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
  loyaltyOffers?: boolean;
  waiterOrderApproval?: boolean;
  orderJourneyLayout?: "floating_capsule" | "split_card" | "slim_accordion";
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

function getSpiciness(name: string, desc: string | null): "mild" | "medium" | "spicy" {
  const text = `${name} ${desc || ""}`.toLowerCase();
  if (
    text.includes("extra spicy") ||
    text.includes("schezwan") ||
    text.includes("peri peri") ||
    text.includes("kolhapuri") ||
    text.includes("vindaloo") ||
    text.includes("mirch") ||
    text.includes("angara") ||
    text.includes("chilli") ||
    text.includes("hot garlic") ||
    text.includes("spicy") ||
    text.includes("tikka")
  ) {
    return "spicy";
  }
  if (
    text.includes("korma") ||
    text.includes("malai") ||
    text.includes("butter") ||
    text.includes("sweet") ||
    text.includes("shahi") ||
    text.includes("sweet corn") ||
    text.includes("curd") ||
    text.includes("custard") ||
    text.includes("ice cream") ||
    text.includes("shake") ||
    text.includes("halwa") ||
    text.includes("kheer") ||
    text.includes("lassi")
  ) {
    return "mild";
  }
  return "medium";
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
  const [theme, setTheme] = useState<RestaurantThemeType>("amber");
  const [branding, setBranding] = useState<RestaurantBrandingConfig>(DEFAULT_BRANDING_CONFIG);

  // Feature Entitlements controlled by Super Admin
  const [features, setFeatures] = useState<RestaurantFeatures>({
    callWaiter: true,
    prepTimeTracker: true,
    customRequests: true,
    tablePayUpi: true,
    dishNotes: true,
    smartUpsell: true,
    feedbackReview: true,
    loyaltyOffers: true,
    waiterOrderApproval: true,
  });

  const [isApprovalPending, setIsApprovalPending] = useState<boolean>(false);

  // Dynamic Restaurant Offers & Retention Config
  const [offerConfig, setOfferConfig] = useState<RestaurantOfferConfig>(DEFAULT_OFFER_CONFIG);
  const [upsellConfig, setUpsellConfig] = useState<SmartUpsellConfig>(DEFAULT_UPSELL_CONFIG);
  const [isScratchModalOpen, setIsScratchModalOpen] = useState(false);

  // Flow State
  const [hasDismissedWelcome, setHasDismissedWelcome] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(`od_welcomed_${token}`) === "true";
    }
    return false;
  });

  // Fast Dietary & Category Filters
  const [selectedCat, setSelectedCat] = useState<string>("all");
  const [dietFilter, setDietFilter] = useState<"all" | "veg" | "nonveg" | "bestseller" | "under_199" | "spicy">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedNotes, setExpandedNotes] = useState<{ [id: string]: boolean }>({});

  // Cart: Map<menuItemId, { qty: number, notes: string, addedBy: string }>
  const [cart, setCart] = useState<{ [id: string]: { qty: number; notes: string; addedBy: string } }>({});
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccessMsg, setOrderSuccessMsg] = useState("");
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [selectedJourneyStation, setSelectedJourneyStation] = useState<number | null>(null);
  const [isJourneySheetOpen, setIsJourneySheetOpen] = useState<boolean>(false);
  const [urlLayoutParam, setUrlLayoutParam] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const l = sp.get("layout");
      if (l === "floating_capsule" || l === "split_card" || l === "slim_accordion") {
        setUrlLayoutParam(l);
      }
    }
  }, []);

  const currentJourneyLayout: "floating_capsule" | "split_card" | "slim_accordion" =
    (urlLayoutParam as any) || features.orderJourneyLayout || "floating_capsule";



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

  // Micro-interaction & Feature States
  const [flyingParticles, setFlyingParticles] = useState<
    Array<{ id: number; x: number; y: number; tx: number; ty: number; emoji: string }>
  >([]);
  const [isCartBouncing, setIsCartBouncing] = useState<boolean>(false);
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState<boolean>(false);
  const [activePaymentTab, setActivePaymentTab] = useState<"app" | "qr">("app");
  const [upiCopied, setUpiCopied] = useState<boolean>(false);
  const [quickAddNotice, setQuickAddNotice] = useState<string>("");

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
          if (parsed.branding) {
            setBranding(parsed.branding);
            if (parsed.branding.theme) setTheme(parsed.branding.theme);
          } else if (parsed.theme) {
            setTheme(parsed.theme);
          }
          if (parsed.features) setFeatures(parsed.features);
          if (parsed.offerConfig) setOfferConfig(parsed.offerConfig);
          if (parsed.upsellConfig) setUpsellConfig(parsed.upsellConfig);
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
      if (data.isApprovalPending !== undefined) setIsApprovalPending(Boolean(data.isApprovalPending));
      if (data.joinedNotice !== undefined) setJoinedNotice(data.joinedNotice);
      if (data.branding) {
        setBranding(data.branding);
        if (data.branding.theme) setTheme(data.branding.theme);
      } else if (data.theme) {
        setTheme(data.theme);
      }
      if (data.features) setFeatures(data.features);
      if (data.offerConfig) setOfferConfig(data.offerConfig);
      if (data.upsellConfig) setUpsellConfig(data.upsellConfig);

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
        if (data.isApprovalPending !== undefined) setIsApprovalPending(Boolean(data.isApprovalPending));
        if (data.joinedNotice !== undefined) setJoinedNotice(data.joinedNotice);
        if (data.branding) {
          setBranding(data.branding);
          if (data.branding.theme) setTheme(data.branding.theme);
        } else if (data.theme) {
          setTheme(data.theme);
        }
        if (data.features) setFeatures(data.features);
        if (data.offerConfig) setOfferConfig(data.offerConfig);
        if (data.upsellConfig) setUpsellConfig(data.upsellConfig);
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

    // Adaptive polling: pause when tab/phone is backgrounded or screen locked
    let pollInterval: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          return; // Skip poll cycle if user switched tabs / locked screen
        }
        loadTableData();
      }, 3500);
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined") {
        if (document.visibilityState === "visible") {
          loadTableData(); // Instant sync when user returns
          startPolling();
        } else if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }
    };

    startPolling();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [token, loadTableData]);

  function addToCart(itemId: string, e?: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) {
    triggerHaptic(14);

    // Trigger Fly-to-Cart Particle Animation
    if (e && typeof window !== "undefined") {
      try {
        const rect = e.currentTarget.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;
        const targetX = window.innerWidth / 2;
        const targetY = window.innerHeight - 35;
        const item = items.find((i) => i.id === itemId);
        const emoji = item ? getFoodEmoji(item.name, item.is_veg) : "✨";

        const newP = {
          id: Date.now() + Math.random(),
          x: startX,
          y: startY,
          tx: targetX - startX,
          ty: targetY - startY,
          emoji,
        };

        setFlyingParticles((prev) => [...prev, newP]);

        setTimeout(() => {
          setFlyingParticles((prev) => prev.filter((p) => p.id !== newP.id));
          setIsCartBouncing(true);
          setTimeout(() => setIsCartBouncing(false), 380);
        }, 620);
      } catch {
        setIsCartBouncing(true);
        setTimeout(() => setIsCartBouncing(false), 380);
      }
    } else {
      setIsCartBouncing(true);
      setTimeout(() => setIsCartBouncing(false), 380);
    }

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

  // Dynamic Table Offer Discount calculation
  const isOfferActive = features.loyaltyOffers !== false && offerConfig.active;
  const discountApplicable = isOfferActive && subtotalCart >= offerConfig.minOrderValue;
  const discountAmount = discountApplicable
    ? Math.round(subtotalCart * (offerConfig.discountPercent / 100))
    : 0;
  const discountedSubtotal = Math.max(0, subtotalCart - discountAmount);

  // Indian GST 5%: 2.5% CGST + 2.5% SGST on discounted subtotal
  const cgst = Math.round(discountedSubtotal * 0.025 * 100) / 100;
  const sgst = Math.round(discountedSubtotal * 0.025 * 100) / 100;
  const grandTotal = Math.round(discountedSubtotal + cgst + sgst);

  // Active Order / Bill Calculation for UPI Payment
  const activeOrderSubtotal = (activeOrder?.order_items || []).reduce(
    (sum, item) => sum + Number(item.unit_price) * item.qty,
    0
  );
  const activeOrderCgst = Math.round(activeOrderSubtotal * 0.025 * 100) / 100;
  const activeOrderSgst = Math.round(activeOrderSubtotal * 0.025 * 100) / 100;
  const activeOrderGrandTotal = Math.round(activeOrderSubtotal + activeOrderCgst + activeOrderSgst);
  const payableBillTotal = activeOrderGrandTotal > 0 ? activeOrderGrandTotal : grandTotal;

  // 1-Tap Quick Re-Order candidates (Rotis, Drinks, Bestsellers)
  const quickReorderCandidates = items
    .filter((it) => {
      const n = it.name.toLowerCase();
      return (
        n.includes("roti") ||
        n.includes("naan") ||
        n.includes("paratha") ||
        n.includes("kulcha") ||
        n.includes("water") ||
        n.includes("coke") ||
        n.includes("soda") ||
        n.includes("drink") ||
        n.includes("beverage") ||
        n.includes("lassi") ||
        n.includes("rice") ||
        n.includes("papad") ||
        n.includes("raita") ||
        it.is_bestseller
      );
    })
    .slice(0, 10);

  // Top Star Highlights & Chef's Bestsellers for the animated header rail
  const topBestsellers = useMemo(() => {
    const list = items.filter((it) => it.is_available && it.is_bestseller);
    if (list.length >= 3) return list.slice(0, 8);
    return items.filter((it) => it.is_available).slice(0, 6);
  }, [items]);

  // Intelligent Context-Aware Smart Upsell & Basket Pairing Engine
  const upsellCandidates = useMemo(() => {
    if (!features.smartUpsell || !upsellConfig.enabled) return [];

    const cartDishIds = Object.keys(cart);
    const cartDishList = cartDishIds
      .map((id) => items.find((i) => i.id === id))
      .filter(Boolean) as MenuItem[];

    // Available items not currently in the cart
    const availableItems = items.filter((it) => it.is_available && !cart[it.id]);
    if (availableItems.length === 0) return [];

    // Dietary integrity: If cart contains ONLY veg items, strictly recommend pure veg dishes
    const isCartPureVeg = cartDishList.length > 0 && cartDishList.every((it) => it.is_veg);
    const dietaryCandidates = isCartPureVeg ? availableItems.filter((it) => it.is_veg) : availableItems;

    // Detect culinary components in diner's current cart
    const hasCurry = cartDishList.some((it) => {
      const n = it.name.toLowerCase();
      const d = (it.description || "").toLowerCase();
      return (
        n.includes("curry") ||
        n.includes("dal") ||
        n.includes("gravy") ||
        n.includes("masala") ||
        n.includes("paneer") ||
        n.includes("butter chicken") ||
        d.includes("curry") ||
        d.includes("gravy")
      );
    });

    const hasBreadsOrRice = cartDishList.some((it) => {
      const n = it.name.toLowerCase();
      return (
        n.includes("roti") ||
        n.includes("naan") ||
        n.includes("paratha") ||
        n.includes("kulcha") ||
        n.includes("bread") ||
        n.includes("rice") ||
        n.includes("biryani") ||
        n.includes("pulao")
      );
    });

    const hasStartersOrSpicy = cartDishList.some((it) => {
      const n = it.name.toLowerCase();
      return (
        n.includes("tikka") ||
        n.includes("kebab") ||
        n.includes("starter") ||
        n.includes("fry") ||
        n.includes("chilli") ||
        n.includes("schezwan") ||
        n.includes("crispy") ||
        n.includes("tandoor")
      );
    });

    const hasDrinks = cartDishList.some((it) => {
      const n = it.name.toLowerCase();
      return (
        n.includes("coke") ||
        n.includes("soda") ||
        n.includes("mojito") ||
        n.includes("shake") ||
        n.includes("lassi") ||
        n.includes("juice") ||
        n.includes("water") ||
        n.includes("drink") ||
        n.includes("beverage") ||
        n.includes("chai") ||
        n.includes("coffee") ||
        n.includes("cooler")
      );
    });

    const hasDessert = cartDishList.some((it) => {
      const n = it.name.toLowerCase();
      return (
        n.includes("ice cream") ||
        n.includes("gulab") ||
        n.includes("sweet") ||
        n.includes("halwa") ||
        n.includes("kheer") ||
        n.includes("cake") ||
        n.includes("brownie") ||
        n.includes("dessert") ||
        n.includes("kulfi")
      );
    });

    const spendGap = offerConfig.active ? offerConfig.minOrderValue - subtotalCart : 0;
    const isNearSpendGoal = offerConfig.active && spendGap > 0 && spendGap <= 160;

    type ScoredUpsell = {
      id: string;
      name: string;
      price: number;
      is_veg: boolean;
      photo_url: string | null;
      reasonTag: string;
      reasonIcon: string;
      score: number;
    };

    const scored: ScoredUpsell[] = [];

    for (const item of dietaryCandidates) {
      const n = item.name.toLowerCase();
      const p = Number(item.price);
      let score = 0;
      let reasonTag = "Chef Pick";
      let reasonIcon = "✨";

      // Proximity spend-goal nudge: if item price bridges gap to unlock offer
      if (upsellConfig.showSpendGoalNudge && isNearSpendGoal && p >= spendGap - 25 && p <= spendGap + 70) {
        score += 85;
        reasonTag = `Unlock ${offerConfig.discountPercent}% OFF`;
        reasonIcon = "🎁";
      }

      // 1. Curry -> Breads & Rice pairing
      if (hasCurry && !hasBreadsOrRice) {
        if (n.includes("naan") || n.includes("roti") || n.includes("paratha") || n.includes("kulcha") || n.includes("jeera rice")) {
          score += 65;
          reasonTag = "Pairs with Curry";
          reasonIcon = "🫓";
        }
      }

      // 2. Starters / Spicy -> Cooling Beverages
      if (upsellConfig.pushBeveragesWithStarters && hasStartersOrSpicy && !hasDrinks) {
        if (n.includes("lassi") || n.includes("mojito") || n.includes("shake") || n.includes("cooler") || n.includes("soda") || n.includes("coke") || n.includes("juice") || n.includes("drink")) {
          score += 60;
          reasonTag = "Cooling Drink Pair";
          reasonIcon = "🥤";
        }
      }

      // 3. Meals -> Desserts near checkout
      if (upsellConfig.pushDessertsNearCheckout && (subtotalCart >= 250 || cartDishList.length >= 2) && !hasDessert) {
        if (n.includes("ice cream") || n.includes("gulab") || n.includes("halwa") || n.includes("kheer") || n.includes("brownie") || n.includes("kulfi")) {
          score += 55;
          reasonTag = "Sweet Finish";
          reasonIcon = "🍨";
        }
      }

      // Strategy-specific bonuses
      if (upsellConfig.strategy === "bestsellers") {
        if (item.is_bestseller) {
          score += 40;
          if (reasonTag === "Chef Pick") {
            reasonTag = "Bestseller";
            reasonIcon = "🔥";
          }
        }
      } else if (upsellConfig.strategy === "high_margin") {
        if (n.includes("beverage") || n.includes("drink") || n.includes("shake") || n.includes("papad") || n.includes("raita") || n.includes("starter") || n.includes("tikka")) {
          score += 35;
          if (reasonTag === "Chef Pick") {
            reasonTag = "Popular Add-on";
            reasonIcon = "⭐";
          }
        }
      } else if (upsellConfig.strategy === "budget_addons") {
        if (p <= 120) {
          score += 45;
          if (reasonTag === "Chef Pick") {
            reasonTag = "Quick Add-on";
            reasonIcon = "⚡";
          }
        }
      } else {
        // "smart_ai"
        if (item.is_bestseller) score += 20;
        if (p <= 150) score += 10;
      }

      // Fallback baseline score
      if (score === 0) {
        if (item.is_bestseller) {
          score = 15;
          reasonTag = "Crowd Favorite";
          reasonIcon = "🔥";
        } else if (p <= 110) {
          score = 10;
          reasonTag = "Budget Add-on";
          reasonIcon = "⚡";
        } else {
          score = 5;
        }
      }

      scored.push({
        id: item.id,
        name: item.name,
        price: p,
        is_veg: item.is_veg,
        photo_url: item.photo_url,
        reasonTag,
        reasonIcon,
        score,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    const maxLimit = Math.min(6, Math.max(1, upsellConfig.maxItems || 3));
    return scored.slice(0, maxLimit);
  }, [cart, items, features.smartUpsell, upsellConfig, offerConfig, subtotalCart]);

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
      setShowDispatchModal(true);
      triggerHaptic(25);
      if (data.approvalPending) {
        setIsApprovalPending(true);
        setOrderSuccessMsg("Order dispatched! Floor captain will verify items at your table shortly.");
      } else {
        setOrderSuccessMsg("Order sent to kitchen! Cooking begins immediately.");
      }
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
    if (dietFilter === "under_199" && Number(item.price) > 199) return false;
    if (dietFilter === "spicy" && getSpiciness(item.name, item.description) !== "spicy") return false;
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
        <FoodChefLoader
          variant="light"
          restaurantName={restaurantName}
          tableNumber={tableNumber}
          message="Connecting to your table station..."
          subMessage="Chef is preparing your instant digital menu..."
          size="lg"
        />
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

  // STEP 1: POST-SCAN WELCOME (5-Star Luxury No-Scroll Viewport)
  if (!hasDismissedWelcome) {
    return (
      <main
        data-theme={theme}
        className="h-[100dvh] max-h-[100dvh] w-full max-w-md mx-auto flex flex-col justify-between p-4 sm:p-5 overflow-hidden select-none"
        style={{ backgroundColor: "var(--paper)", color: "var(--ink)" }}
      >
        {/* Top Header Section */}
        <div className="flex-shrink-0 space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <div
              className="text-[10px] font-black px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 shadow-xs uppercase tracking-wider"
              style={{
                backgroundColor: "var(--brand-primary)",
                color: "var(--rust-text)",
              }}
            >
              <span>✦</span>
              <span>VIP Dine-In Service</span>
            </div>

            <div className="flex items-center gap-1 bg-white/80 backdrop-blur px-2 py-0.5 rounded-full border shadow-xs" style={{ borderColor: "var(--hairline)" }}>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  setTheme("saffron");
                }}
                title="Punjab Saffron Theme"
                className={`w-3.5 h-3.5 rounded-full border cursor-pointer ${theme === "saffron" ? "ring-2 ring-orange-500 scale-110" : "opacity-50"}`}
                style={{ backgroundColor: "#EA580C", borderColor: "#2C1810" }}
              />
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  setTheme("amber");
                }}
                title="Amber Gold Theme"
                className={`w-3.5 h-3.5 rounded-full border cursor-pointer ${theme === "amber" ? "ring-2 ring-amber-500 scale-110" : "opacity-50"}`}
                style={{ backgroundColor: "#FFBE0B", borderColor: "#2A2312" }}
              />
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  setTheme("crimson");
                }}
                title="Velvet Crimson Theme"
                className={`w-3.5 h-3.5 rounded-full border cursor-pointer ${theme === "crimson" ? "ring-2 ring-rose-700 scale-110" : "opacity-50"}`}
                style={{ backgroundColor: "#741A2F", borderColor: "#FFC6A8" }}
              />
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  setTheme("emerald");
                }}
                title="Pure Emerald Theme"
                className={`w-3.5 h-3.5 rounded-full border cursor-pointer ${theme === "emerald" ? "ring-2 ring-emerald-500 scale-110" : "opacity-50"}`}
                style={{ backgroundColor: "#059669", borderColor: "#022C22" }}
              />
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  setTheme("charcoal");
                }}
                title="Midnight Charcoal Theme"
                className={`w-3.5 h-3.5 rounded-full border cursor-pointer ${theme === "charcoal" ? "ring-2 ring-amber-400 scale-110" : "opacity-50"}`}
                style={{ backgroundColor: "#18181B", borderColor: "#F59E0B" }}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            {branding?.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={restaurantName}
                className="w-12 h-12 rounded-2xl object-cover shadow-sm border flex-shrink-0"
                style={{ borderColor: "var(--hairline)" }}
              />
            ) : null}
            <div className="min-w-0">
              <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight line-clamp-1 leading-tight" style={{ color: "var(--ink)" }}>
                {restaurantName}
              </h1>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold mt-0.5" style={{ color: "var(--ink-soft)" }}>
                <span className="text-amber-500">★★★★★</span>
                <span className="line-clamp-1">{branding?.tagline || "Instant Contactless Table Experience"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Centerpiece: Luxury Confirmed Table Card */}
        <div
          className="my-auto p-4 sm:p-5 rounded-2xl border shadow-md relative overflow-hidden flex flex-col justify-between"
          style={{
            backgroundColor: "var(--card-bg, #FFFFFF)",
            borderColor: "var(--hairline)",
          }}
        >
          {/* Subtle Ambient Radial Glow */}
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex justify-between items-start relative z-10">
            <div>
              <div className="text-[10px] font-black tracking-widest uppercase flex items-center gap-1.5" style={{ color: "var(--ink-soft)" }}>
                <span>CONFIRMED TABLE</span>
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="font-heading text-5xl sm:text-6xl font-black tracking-tight mt-1 leading-none" style={{ color: "var(--ink)" }}>
                {tableNumber || "T--"}
              </div>
            </div>

            {/* Luxury Medallion Icon */}
            <div
              className="w-13 h-13 rounded-2xl flex items-center justify-center text-2xl shadow-sm border"
              style={{
                backgroundColor: "var(--paper-dim)",
                borderColor: "var(--hairline)",
              }}
            >
              🛎️
            </div>
          </div>

          <div
            className="mt-4 pt-3 border-t flex items-center justify-between text-[11px] font-bold"
            style={{ borderColor: "var(--hairline)" }}
          >
            <div className="flex items-center gap-2" style={{ color: "var(--sage)" }}>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600" />
              </span>
              <span>Kitchen Live Connection Active</span>
            </div>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
              0-LAG SYNC
            </span>
          </div>
        </div>

        {/* Compact 3-Column Luxury Feature Badges (Zero Scroll Footprint) */}
        <div className="grid grid-cols-3 gap-2 my-auto">
          <div
            className="p-2.5 rounded-xl border bg-white/70 backdrop-blur text-center flex flex-col items-center justify-center shadow-xs"
            style={{ borderColor: "var(--hairline)" }}
          >
            <span className="text-xl mb-0.5">⚡</span>
            <span className="text-[11px] font-bold leading-tight" style={{ color: "var(--ink)" }}>
              0-Wait Menu
            </span>
            <span className="text-[9px] font-medium" style={{ color: "var(--ink-soft)" }}>
              Instant Cache
            </span>
          </div>

          <div
            className="p-2.5 rounded-xl border bg-white/70 backdrop-blur text-center flex flex-col items-center justify-center shadow-xs"
            style={{ borderColor: "var(--hairline)" }}
          >
            <span className="text-xl mb-0.5">⏳</span>
            <span className="text-[11px] font-bold leading-tight" style={{ color: "var(--ink)" }}>
              Live Cook
            </span>
            <span className="text-[9px] font-medium" style={{ color: "var(--ink-soft)" }}>
              Prep Timer
            </span>
          </div>

          <div
            className="p-2.5 rounded-xl border bg-white/70 backdrop-blur text-center flex flex-col items-center justify-center shadow-xs"
            style={{ borderColor: "var(--hairline)" }}
          >
            <span className="text-xl mb-0.5">🛎️</span>
            <span className="text-[11px] font-bold leading-tight" style={{ color: "var(--ink)" }}>
              Staff Bell
            </span>
            <span className="text-[9px] font-medium" style={{ color: "var(--ink-soft)" }}>
              1-Tap Buzzer
            </span>
          </div>
        </div>

        {/* Bottom CTA Area - Always in View with 0 Scroll */}
        <div className="flex-shrink-0 pt-2 pb-1 space-y-1.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(15);
              setHasDismissedWelcome(true);
              if (typeof window !== "undefined") {
                sessionStorage.setItem(`od_welcomed_${token}`, "true");
              }
            }}
            className="w-full h-13 sm:h-14 rounded-xl text-base font-black shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer group"
            style={{
              backgroundColor: "var(--rust)",
              color: "var(--rust-text)",
            }}
          >
            <span className="tracking-wide">Explore Menu & Order</span>
            <span className="text-lg transition-transform group-hover:translate-x-1">→</span>
          </button>
          <p className="text-center text-[10px] font-medium" style={{ color: "var(--ink-soft)" }}>
            ✦ No app download needed • Instant live kitchen order
          </p>
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
        <div className="flex items-center gap-2.5 min-w-0">
          {branding?.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={restaurantName}
              className="w-9 h-9 rounded-xl object-cover shadow-xs border flex-shrink-0"
              style={{ borderColor: "var(--hairline)" }}
            />
          ) : (
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm font-heading flex-shrink-0" style={{ backgroundColor: "var(--brand-primary)", color: "var(--rust-text)" }}>
              {tableNumber || "T"}
            </div>
          )}
          <div className="min-w-0">
            <span className="font-heading text-base font-bold tracking-tight block leading-tight truncate" style={{ color: "var(--ink)" }}>
              {restaurantName}
            </span>
            <div className="flex items-center gap-1.5 text-[11px] font-medium truncate" style={{ color: "var(--ink-soft)" }}>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
              <span className="truncate">{branding?.tagline ? branding.tagline : `Table ${tableNumber} · Live Station`}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Quick theme toggle */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic(8);
              const themes: RestaurantThemeType[] = ["amber", "saffron", "crimson", "emerald", "charcoal"];
              const nextIdx = (themes.indexOf(theme) + 1) % themes.length;
              setTheme(themes[nextIdx]);
            }}
            title={`Current theme: ${theme}. Click to switch theme palette.`}
            className="w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer transition-transform active:scale-95 shadow-sm"
            style={{
              backgroundColor: "var(--paper-dim)",
              borderColor: "var(--hairline)",
            }}
          >
            <span className="text-[13px]">
              {theme === "amber" ? "👑" : theme === "saffron" ? "🔥" : theme === "crimson" ? "🍷" : theme === "emerald" ? "🌿" : "⚡"}
            </span>
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

      {/* Dynamic Island: Persistent Live Order Status Pill (Visible whenever order is active) */}
      {activeOrder && activeOrder.order_items.length > 0 && (
        <div
          onClick={() => {
            triggerHaptic(10);
            if (currentJourneyLayout === "floating_capsule") {
              setIsJourneySheetOpen(true);
            } else {
              setIsTicketExpanded(true);
              const el = document.getElementById("live-order-journey-map");
              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }}
          className="mx-4 mt-2.5 px-3.5 py-2.5 rounded-2xl border shadow-sm cursor-pointer flex items-center justify-between transition-all hover:scale-[1.01] active:scale-[0.99] select-none"
          style={{
            backgroundColor: isApprovalPending
              ? "#FFFBEB"
              : activeStage === "preparing"
              ? "#EFF6FF"
              : activeStage === "served"
              ? "#F0FDF4"
              : "#FFF7ED",
            borderColor: isApprovalPending
              ? "#FCD34D"
              : activeStage === "preparing"
              ? "#93C5FD"
              : activeStage === "served"
              ? "#86EFAC"
              : "#FDBA74",
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-ping"
              style={{
                backgroundColor: isApprovalPending
                  ? "#D97706"
                  : activeStage === "preparing"
                  ? "#2563EB"
                  : activeStage === "served"
                  ? "#059669"
                  : "#EA580C",
              }}
            />
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-wider truncate text-stone-900 flex items-center gap-1.5">
                <span>
                  {isApprovalPending
                    ? "Station 2: Captain Verifying at Table"
                    : activeStage === "preparing"
                    ? "Station 3: Chef Cooking in Kitchen"
                    : activeStage === "served"
                    ? "Station 4: Served Hot & Fresh!"
                    : "Station 1: Order Captured"}
                </span>
                {activeStage === "preparing" && remainingMinutesText && (
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 font-bold">
                    ⏳ {remainingMinutesText}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-stone-500 truncate">
                {activeOrder.order_items.length} items in live ticket · Tap to view journey map
              </div>
            </div>
          </div>
          <span className="text-[11px] font-bold text-amber-900 bg-white/80 px-2 py-1 rounded-lg border border-amber-200/60 shadow-2xs flex items-center gap-1 flex-shrink-0">
            <span>Track</span>
            <span>➔</span>
          </span>
        </div>
      )}

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

      {/* UPI Settlement Modal with Direct 1-Tap App Buttons & QR Tab */}
      {showUpiQrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ backgroundColor: "rgba(34, 29, 22, 0.65)" }}
          onClick={() => setShowUpiQrModal(false)}
        >
          <div
            className="w-full max-w-sm p-5 rounded-3xl border shadow-2xl text-center bg-white animate-scale-in"
            style={{ borderColor: "var(--hairline)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Amount */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="text-left">
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                  Table {tableNumber} Settlement
                </span>
                <span className="font-heading text-2xl font-extrabold text-stone-900">
                  ₹{payableBillTotal}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowUpiQrModal(false)}
                className="w-8 h-8 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center font-bold text-xs cursor-pointer hover:bg-stone-200"
              >
                ✕
              </button>
            </div>

            {/* Tab Switcher: 1-Tap UPI Apps vs Scan QR */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-100 rounded-xl my-3.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  setActivePaymentTab("app");
                }}
                className={`py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activePaymentTab === "app"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                <span>📱</span>
                <span>1-Tap UPI Apps</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  setActivePaymentTab("qr");
                }}
                className={`py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activePaymentTab === "qr"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                <span>📷</span>
                <span>Scan QR</span>
              </button>
            </div>

            {/* TAB 1: Direct 1-Tap Native Mobile UPI Buttons */}
            {activePaymentTab === "app" && (
              <div className="space-y-2.5 my-2 text-left">
                <p className="text-[11px] text-stone-500 text-center mb-3">
                  Tap your preferred UPI app to pay ₹{payableBillTotal} directly on this phone.
                </p>

                {(() => {
                  const upiMerchantId = "orderdesk@icici";
                  const upiPayload = `upi://pay?pa=${upiMerchantId}&pn=${encodeURIComponent(
                    restaurantName || "Order Desk"
                  )}&am=${payableBillTotal}&cu=INR&tn=${encodeURIComponent(`Table ${tableNumber} Bill`)}`;

                  return (
                    <div className="space-y-2">
                      {/* PhonePe */}
                      <a
                        href={upiPayload}
                        onClick={() => triggerHaptic(15)}
                        className="w-full py-2.5 px-4 rounded-xl flex items-center justify-between text-white font-bold text-xs shadow-sm active:scale-98 transition-transform"
                        style={{ backgroundColor: "#5f259f" }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">🟣</span>
                          <span>PhonePe</span>
                        </div>
                        <span className="text-[11px] opacity-90">Pay ₹{payableBillTotal} →</span>
                      </a>

                      {/* Google Pay */}
                      <a
                        href={upiPayload}
                        onClick={() => triggerHaptic(15)}
                        className="w-full py-2.5 px-4 rounded-xl flex items-center justify-between text-white font-bold text-xs shadow-sm active:scale-98 transition-transform"
                        style={{ backgroundColor: "#0f9d58" }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">🟢</span>
                          <span>Google Pay (GPay)</span>
                        </div>
                        <span className="text-[11px] opacity-90">Pay ₹{payableBillTotal} →</span>
                      </a>

                      {/* Paytm */}
                      <a
                        href={upiPayload}
                        onClick={() => triggerHaptic(15)}
                        className="w-full py-2.5 px-4 rounded-xl flex items-center justify-between text-white font-bold text-xs shadow-sm active:scale-98 transition-transform"
                        style={{ backgroundColor: "#00b9f5" }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">🔵</span>
                          <span>Paytm UPI</span>
                        </div>
                        <span className="text-[11px] opacity-90">Pay ₹{payableBillTotal} →</span>
                      </a>

                      {/* Any Other UPI App */}
                      <a
                        href={upiPayload}
                        onClick={() => triggerHaptic(15)}
                        className="w-full py-2.5 px-4 rounded-xl flex items-center justify-between bg-stone-900 text-white font-bold text-xs shadow-sm active:scale-98 transition-transform"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">🇮🇳</span>
                          <span>Any UPI App (BHIM / Cred / Bank)</span>
                        </div>
                        <span className="text-[11px] opacity-90">Open →</span>
                      </a>
                    </div>
                  );
                })()}

                {/* Copy UPI ID Chip */}
                <div className="pt-2">
                  <div
                    onClick={() => {
                      triggerHaptic(10);
                      if (typeof navigator !== "undefined" && navigator.clipboard) {
                        navigator.clipboard.writeText("orderdesk@icici");
                        setUpiCopied(true);
                        setTimeout(() => setUpiCopied(false), 2500);
                      }
                    }}
                    className="p-2 rounded-xl border border-dashed border-stone-300 bg-stone-50 flex items-center justify-between text-xs cursor-pointer hover:bg-stone-100"
                  >
                    <div className="flex items-center gap-1.5 text-stone-600">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">UPI ID:</span>
                      <span className="font-mono font-bold text-stone-800">orderdesk@icici</span>
                    </div>
                    <span className="text-[11px] font-bold text-amber-700">
                      {upiCopied ? "✓ Copied!" : "📋 Copy"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Dynamic QR Code Scan */}
            {activePaymentTab === "qr" && (
              <div className="my-2 space-y-3">
                <p className="text-[11px] text-stone-500">
                  Scan with GPay, PhonePe, Paytm or BHIM on any companion phone:
                </p>

                {(() => {
                  const upiMerchantId = "orderdesk@icici";
                  const upiPayload = `upi://pay?pa=${upiMerchantId}&pn=${encodeURIComponent(
                    restaurantName || "Order Desk"
                  )}&am=${payableBillTotal}&cu=INR&tn=${encodeURIComponent(`Table ${tableNumber} Bill`)}`;
                  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(
                    upiPayload
                  )}`;

                  return (
                    <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 inline-block mx-auto shadow-inner">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrUrl}
                        alt={`UPI QR Table ${tableNumber}`}
                        className="w-44 h-44 object-contain rounded-xl mx-auto shadow-xs bg-white"
                      />
                      <div className="text-[10px] font-mono font-bold text-stone-600 mt-2">
                        orderdesk@icici · Table {tableNumber}
                      </div>
                    </div>
                  );
                })()}

                <div className="text-[11px] text-stone-500">
                  Total Bill: <strong className="text-stone-900 font-bold">₹{payableBillTotal}</strong>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-stone-100 text-[11px] text-stone-500">
              Waiter will bring stamped tax receipt upon payment.
            </div>

            <button
              type="button"
              onClick={() => setShowUpiQrModal(false)}
              className="w-full mt-3 py-2.5 text-xs font-bold rounded-xl cursor-pointer shadow-sm active:scale-98 transition-all"
              style={{ backgroundColor: "var(--rust)", color: "var(--rust-text)" }}
            >
              Done / Paid
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

      {/* Live Order Journey Tracker: Multi-Mode Responsive Roadmap */}
      {activeOrder && activeOrder.order_items.length > 0 && (() => {
        const orderTotal = activeOrder.order_items.reduce(
          (sum, it) => sum + Number(it.unit_price) * Number(it.qty),
          0
        );

        const renderOrderItemCards = () =>
          activeOrder.order_items.map((it) => (
            <div
              key={it.id}
              className="p-2.5 rounded-xl bg-stone-50/90 border border-stone-200/90 hover:border-stone-300 transition-all text-xs space-y-1.5"
            >
              {/* Line 1: Veg indicator + Full Dish Name (100% width, no truncation) + Item Price */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`${it.menu_items?.is_veg ? "veg-indicator" : "nonveg-indicator"} shrink-0 mt-0.5`} />
                  <span className="font-bold text-stone-900 text-xs sm:text-sm leading-snug break-words">
                    {it.menu_items?.name || "Dish"}
                  </span>
                </div>
                <span className="font-mono font-black text-stone-900 text-xs sm:text-sm shrink-0 whitespace-nowrap">
                  ₹{Number(it.unit_price) * Number(it.qty)}
                </span>
              </div>

              {/* Line 2: Quantity, Unit Price, Status Badge, and 1-Tap Repeat Button */}
              <div className="flex items-center justify-between pt-1 border-t border-stone-200/50 text-[11px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-stone-600 bg-stone-200/60 px-1.5 py-0.5 rounded text-[10px]">
                    {it.qty}×
                  </span>
                  {it.item_status === "served" ? (
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1 shrink-0">
                      <span>✓</span> Ready
                    </span>
                  ) : it.item_status === "preparing" ? (
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full border border-blue-300 animate-pulse flex items-center gap-1 shrink-0">
                      <span>🔥</span> Cooking
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-300 flex items-center gap-1 shrink-0">
                      <span>⏳</span> Queued
                    </span>
                  )}
                  <span className="text-[10px] text-stone-400 font-mono">
                    (₹{it.unit_price}/ea)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleReorderItem(it)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold border bg-white hover:bg-stone-100 cursor-pointer shadow-2xs transition-transform active:scale-95 flex items-center gap-1"
                  style={{ borderColor: "var(--hairline)", color: "var(--rust)" }}
                >
                  <span>+</span> Repeat
                </button>
              </div>
            </div>
          ));

        return (
          <>
            {/* ========================================================================= */}
            {/* OPTION 1: FLOATING BOTTOM CAPSULE + SLIDE-UP SHEET (INLINE COMPACT STRIP) */}
            {/* ========================================================================= */}
            {currentJourneyLayout === "floating_capsule" && (
              <div
                id="live-order-journey-map"
                onClick={() => {
                  triggerHaptic(10);
                  setIsJourneySheetOpen(true);
                }}
                className="mx-4 mt-3 p-3.5 rounded-2xl border shadow-xs flex items-center justify-between cursor-pointer select-none bg-white hover:bg-stone-50/80 transition-all active:scale-[0.99]"
                style={{ borderColor: "var(--hairline)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl shrink-0">
                    {activeStage === "served"
                      ? "🍽️"
                      : activeStage === "preparing"
                      ? "🔥"
                      : isApprovalPending
                      ? "👨‍💼"
                      : "📱"}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-heading text-xs font-black uppercase tracking-wider text-stone-900">
                        Live Order Journey
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-100 text-stone-700 font-bold">
                        #{activeOrder.id.slice(0, 6)}
                      </span>
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase"
                        style={{
                          backgroundColor:
                            isApprovalPending ? "#FFFBEB" : activeStage === "preparing" ? "#EFF6FF" : activeStage === "served" ? "#E8F5E9" : "#F3F4F6",
                          color:
                            isApprovalPending ? "#B45309" : activeStage === "preparing" ? "#1D4ED8" : activeStage === "served" ? "#15803D" : "#374151",
                        }}
                      >
                        {isApprovalPending ? "Verifying" : activeStage === "preparing" ? "Cooking" : activeStage === "served" ? "Served" : "Placed"}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-500 font-medium truncate mt-0.5">
                      {isApprovalPending
                        ? "Floor Captain is reviewing order at Table"
                        : activeStage === "preparing"
                        ? `Chef cooking in Kitchen ${remainingMinutesText ? `(${remainingMinutesText})` : ""}`
                        : activeStage === "served"
                        ? "All dishes served hot & fresh!"
                        : "Order captured at Table"}
                    </div>
                  </div>
                </div>

                <div
                  className="text-[11px] font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1 shrink-0 shadow-2xs"
                  style={{
                    backgroundColor: "var(--rust-soft, #FFF8E7)",
                    borderColor: "var(--rust, #D96B27)",
                    color: "var(--rust, #D96B27)",
                  }}
                >
                  <span>Track</span>
                  <span>▴</span>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* OPTION 2: SIDE-BY-SIDE SPLIT CARD (TABLET & MOBILE RESPONSIVE DUAL COLUMNS)*/}
            {/* ========================================================================= */}
            {currentJourneyLayout === "split_card" && (
              <div
                id="live-order-journey-map"
                className="mx-4 mt-3 rounded-2xl border shadow-sm overflow-hidden bg-white"
                style={{ borderColor: "var(--hairline)" }}
              >
                <div
                  className="p-3.5 bg-stone-50/80 border-b flex items-center justify-between"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">
                      {activeStage === "served" ? "🍽️" : activeStage === "preparing" ? "🔥" : isApprovalPending ? "👨‍💼" : "📱"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-heading text-xs font-black uppercase tracking-wider text-stone-900">
                        Live Order Journey
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-200 text-stone-700 font-bold">
                        #{activeOrder.id.slice(0, 6)}
                      </span>
                    </div>
                  </div>

                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                    style={{
                      backgroundColor:
                        isApprovalPending ? "#FFFBEB" : activeStage === "preparing" ? "#EFF6FF" : activeStage === "served" ? "#E8F5E9" : "#F3F4F6",
                      color:
                        isApprovalPending ? "#B45309" : activeStage === "preparing" ? "#1D4ED8" : activeStage === "served" ? "#15803D" : "#374151",
                    }}
                  >
                    {isApprovalPending ? "Verifying" : activeStage === "preparing" ? "Cooking" : activeStage === "served" ? "Served" : "Placed"}
                  </span>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-4">
                  {/* Left Column: Timeline & Station Status */}
                  <div className="md:col-span-5 flex flex-col justify-between space-y-4 p-3.5 rounded-xl bg-stone-50/60 border border-stone-200/70">
                    <div>
                      <div className="text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-2.5">
                        Station Roadmap
                      </div>
                      <div className="space-y-3 relative pl-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-200">
                        {/* 1. Table */}
                        <div className="relative flex items-center gap-2.5">
                          <span className="absolute -left-6 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black shadow-xs ring-2 ring-emerald-100">
                            ✓
                          </span>
                          <div>
                            <div className="text-xs font-black text-stone-900 leading-tight">Your Table</div>
                            <div className="text-[10px] text-emerald-700 font-semibold">Order Placed</div>
                          </div>
                        </div>

                        {/* 2. Captain */}
                        <div className="relative flex items-center gap-2.5">
                          <span
                            className={`absolute -left-6 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shadow-xs ring-2 ${
                              activeStage === "preparing" || activeStage === "served"
                                ? "bg-emerald-600 text-white ring-emerald-100"
                                : isApprovalPending
                                ? "bg-amber-500 text-stone-900 ring-amber-200 animate-pulse"
                                : "bg-emerald-600 text-white ring-emerald-100"
                            }`}
                          >
                            {activeStage === "preparing" || activeStage === "served" || !isApprovalPending ? "✓" : "👨‍💼"}
                          </span>
                          <div>
                            <div className="text-xs font-black text-stone-900 leading-tight">Floor Captain</div>
                            <div
                              className={`text-[10px] font-semibold ${
                                isApprovalPending ? "text-amber-700 font-bold" : "text-emerald-700"
                              }`}
                            >
                              {isApprovalPending ? "Verifying Items..." : "Approved"}
                            </div>
                          </div>
                        </div>

                        {/* 3. Kitchen */}
                        <div className="relative flex items-center gap-2.5">
                          <span
                            className={`absolute -left-6 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shadow-xs ring-2 ${
                              activeStage === "served"
                                ? "bg-emerald-600 text-white ring-emerald-100"
                                : activeStage === "preparing"
                                ? "bg-blue-600 text-white ring-blue-200 animate-pulse"
                                : "bg-stone-200 text-stone-500 ring-stone-100"
                            }`}
                          >
                            {activeStage === "served" ? "✓" : activeStage === "preparing" ? "🔥" : "3"}
                          </span>
                          <div>
                            <div className="text-xs font-black text-stone-900 leading-tight">Kitchen Stoves</div>
                            <div
                              className={`text-[10px] font-semibold ${
                                activeStage === "preparing"
                                  ? "text-blue-700 font-bold"
                                  : activeStage === "served"
                                  ? "text-emerald-700"
                                  : "text-stone-400"
                              }`}
                            >
                              {activeStage === "preparing"
                                ? remainingMinutesText ? `Cooking (${remainingMinutesText})` : "Cooking"
                                : activeStage === "served"
                                ? "Cooked"
                                : "Pending KOT"}
                            </div>
                          </div>
                        </div>

                        {/* 4. Served */}
                        <div className="relative flex items-center gap-2.5">
                          <span
                            className={`absolute -left-6 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shadow-xs ring-2 ${
                              activeStage === "served"
                                ? "bg-emerald-600 text-white ring-emerald-200"
                                : "bg-stone-200 text-stone-500 ring-stone-100"
                            }`}
                          >
                            {activeStage === "served" ? "✨" : "4"}
                          </span>
                          <div>
                            <div className="text-xs font-black text-stone-900 leading-tight">Table Served</div>
                            <div
                              className={`text-[10px] font-semibold ${
                                activeStage === "served" ? "text-emerald-700" : "text-stone-400"
                              }`}
                            >
                              {activeStage === "served" ? "Delivered Hot" : "Final Stage"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white border border-stone-200/80 text-[11px] text-stone-600 leading-relaxed">
                      {isApprovalPending
                        ? `Captain is reviewing items at Table ${tableNumber} before sending KOT.`
                        : activeStage === "preparing"
                        ? `Kitchen is preparing dishes fresh.${remainingMinutesText ? ` Target time: ${remainingMinutesText}.` : ""}`
                        : activeStage === "served"
                        ? `All dishes served hot at Table ${tableNumber}. Enjoy your meal!`
                        : `Order registered from Table ${tableNumber}.`}
                    </div>
                  </div>

                  {/* Right Column: Dishes in Ticket */}
                  <div className="md:col-span-7 flex flex-col justify-between space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-stone-700 pb-1 border-b border-stone-200/60">
                      <span>Dishes in Ticket ({activeOrder.order_items.length})</span>
                      <span className="font-mono text-stone-900 font-black">
                        Total: ₹{orderTotal}
                      </span>
                    </div>

                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {renderOrderItemCards()}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic(8);
                        const el = document.getElementById("menu-catalog-start");
                        if (el) el.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="w-full py-2 px-3 rounded-lg text-xs font-bold border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 cursor-pointer flex items-center justify-center gap-1 transition-colors"
                    >
                      <span>+ Add Extra Dishes to Table</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* OPTION 3: ULTRA-SLIM INLINE ACCORDION (SINGLE COMPACT CARD WITH 2-LINE)   */}
            {/* ========================================================================= */}
            {currentJourneyLayout === "slim_accordion" && (
              <div
                id="live-order-journey-map"
                className="mx-4 mt-3 rounded-2xl border shadow-sm overflow-hidden bg-white"
                style={{ borderColor: "var(--hairline)" }}
              >
                <div
                  onClick={() => setIsTicketExpanded(!isTicketExpanded)}
                  className="p-3 flex items-center justify-between cursor-pointer select-none bg-stone-50/80 border-b hover:bg-stone-100/60 transition-colors"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xl">
                      {activeStage === "served" ? "🍽️" : activeStage === "preparing" ? "🔥" : isApprovalPending ? "👨‍💼" : "📱"}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-heading text-xs font-black uppercase tracking-wider text-stone-900">
                          Live Order Journey
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-200 text-stone-700 font-bold">
                          #{activeOrder.id.slice(0, 6)}
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-500 font-medium truncate">
                        {activeOrder.order_items.length} dishes • {isApprovalPending ? "Captain Verifying" : activeStage === "preparing" ? "Cooking in Kitchen" : activeStage === "served" ? "Served" : "Placed"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
                      style={{
                        backgroundColor:
                          isApprovalPending ? "#FFFBEB" : activeStage === "preparing" ? "#EFF6FF" : activeStage === "served" ? "#E8F5E9" : "#F3F4F6",
                        color:
                          isApprovalPending ? "#B45309" : activeStage === "preparing" ? "#1D4ED8" : activeStage === "served" ? "#15803D" : "#374151",
                      }}
                    >
                      {isApprovalPending ? "Verifying" : activeStage === "preparing" ? "Cooking" : activeStage === "served" ? "Served" : "Placed"}
                    </span>
                    <span className="text-xs font-bold text-stone-400">
                      {isTicketExpanded ? "▴" : "▾"}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 space-y-3">
                  {/* Slim Progress Bar */}
                  <div className="relative py-1">
                    <div className="absolute left-4 right-4 top-3.5 h-1 bg-stone-200 rounded-full" />
                    <div
                      className="absolute left-4 top-3.5 h-1 bg-gradient-to-r from-emerald-500 via-amber-500 to-sky-500 rounded-full transition-all duration-700"
                      style={{
                        width:
                          activeStage === "served"
                            ? "calc(100% - 2rem)"
                            : activeStage === "preparing"
                            ? "66%"
                            : isApprovalPending
                            ? "33%"
                            : "12%",
                      }}
                    />

                    <div className="relative flex items-start justify-between z-10">
                      <div className="flex flex-col items-center w-14 text-center">
                        <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black shadow-xs">
                          ✓
                        </div>
                        <span className="text-[9px] font-bold mt-1 text-stone-800">Table</span>
                      </div>

                      <div className="flex flex-col items-center w-14 text-center">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shadow-xs ${
                            activeStage === "preparing" || activeStage === "served"
                              ? "bg-emerald-600 text-white"
                              : isApprovalPending
                              ? "bg-amber-500 text-stone-900 animate-pulse"
                              : "bg-emerald-600 text-white"
                          }`}
                        >
                          {activeStage === "preparing" || activeStage === "served" || !isApprovalPending ? "✓" : "👨‍💼"}
                        </div>
                        <span className="text-[9px] font-bold mt-1 text-stone-800">Captain</span>
                      </div>

                      <div className="flex flex-col items-center w-14 text-center">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shadow-xs ${
                            activeStage === "served"
                              ? "bg-emerald-600 text-white"
                              : activeStage === "preparing"
                              ? "bg-blue-600 text-white animate-pulse"
                              : "bg-stone-200 text-stone-500"
                          }`}
                        >
                          {activeStage === "served" ? "✓" : activeStage === "preparing" ? "🔥" : "3"}
                        </div>
                        <span className="text-[9px] font-bold mt-1 text-stone-800">Kitchen</span>
                      </div>

                      <div className="flex flex-col items-center w-14 text-center">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shadow-xs ${
                            activeStage === "served" ? "bg-emerald-600 text-white" : "bg-stone-200 text-stone-500"
                          }`}
                        >
                          {activeStage === "served" ? "✨" : "4"}
                        </div>
                        <span className="text-[9px] font-bold mt-1 text-stone-800">Served</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-2 px-3 rounded-lg bg-stone-50 border border-stone-200 text-[11px] text-stone-600 flex items-center justify-between">
                    <span>
                      {isApprovalPending
                        ? `👨‍💼 Floor captain reviewing items at Table ${tableNumber}`
                        : activeStage === "preparing"
                        ? `🔥 Chef cooking dishes in Kitchen${remainingMinutesText ? ` (${remainingMinutesText})` : ""}`
                        : activeStage === "served"
                        ? `🍽️ All dishes delivered to Table ${tableNumber}!`
                        : `📱 Order captured at Table ${tableNumber}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsTicketExpanded(!isTicketExpanded)}
                      className="text-[10px] font-bold text-stone-500 underline ml-2 cursor-pointer whitespace-nowrap"
                    >
                      {isTicketExpanded ? "Hide Dishes" : `View Dishes (${activeOrder.order_items.length})`}
                    </button>
                  </div>

                  {isTicketExpanded && (
                    <div className="pt-2 border-t border-dashed space-y-2" style={{ borderColor: "var(--hairline)" }}>
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {renderOrderItemCards()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        );
      })()}

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

      {/* Craving More / Add Extra Dishes Anytime Banner */}
      {activeOrder && activeOrder.order_items.length > 0 && (
        <div
          className="mx-4 mt-2.5 p-3 rounded-2xl border shadow-xs flex items-center justify-between gap-3 select-none transition-all"
          style={{
            backgroundColor: "var(--card-bg, #FFFFFF)",
            borderColor: "rgba(245, 158, 11, 0.4)",
            boxShadow: "0 2px 8px -2px rgba(245, 158, 11, 0.15)",
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 shadow-xs"
              style={{ backgroundColor: "var(--brand-primary-soft, #FFF8E7)" }}
            >
              🍲
            </div>
            <div className="min-w-0">
              <strong className="text-xs font-black block leading-tight truncate" style={{ color: "var(--ink)" }}>
                Want to add more dishes?
              </strong>
              <span className="text-[10px] font-medium text-stone-500 leading-snug block">
                Extra naans, drinks & desserts will be added directly to Table {tableNumber}&apos;s bill.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic(8);
              const el = document.getElementById("menu-catalog-start");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-3 py-1.5 text-[11px] font-black rounded-lg shadow-sm cursor-pointer active:scale-95 transition-all shrink-0 uppercase tracking-wider"
            style={{
              backgroundColor: "var(--rust)",
              color: "var(--rust-text)",
            }}
          >
            + Add
          </button>
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

      {/* Dynamic Restaurant Offer & Scratch Reward Banner */}
      {features.loyaltyOffers !== false && offerConfig.active && (
        <div className="mx-4 mt-2 p-3 rounded-2xl border shadow-sm select-none relative overflow-hidden bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100 border-amber-300">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl shrink-0 animate-pulse">🔥</span>
              <div className="min-w-0">
                <div className="text-xs font-black text-amber-950 truncate flex items-center gap-1.5">
                  <span>{offerConfig.bannerText}</span>
                </div>
                <div className="text-[10px] text-amber-800 font-medium leading-tight">
                  {subtotalCart > 0 && subtotalCart < offerConfig.minOrderValue ? (
                    <span>
                      Add <strong>₹{offerConfig.minOrderValue - subtotalCart}</strong> more to unlock FLAT {offerConfig.discountPercent}% OFF!
                    </span>
                  ) : subtotalCart >= offerConfig.minOrderValue ? (
                    <span className="text-emerald-800 font-bold">
                      🎉 Offer Unlocked! You are saving ₹{discountAmount} on this order
                    </span>
                  ) : (
                    <span>Valid on all QR table orders above ₹{offerConfig.minOrderValue}</span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerHaptic(12);
                setIsScratchModalOpen(true);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-900 font-extrabold text-[11px] shadow-xs active:scale-95 transition-transform flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <span>🎁</span>
              <span>Reward</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Star Highlights & Chef's Recommendations Horizontal Snap Carousel */}
      {topBestsellers.length > 0 && (
        <div className="mt-4 pt-1 border-t border-stone-200/60">
          <div className="px-4 flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-base animate-bounce">⭐</span>
              <h2 className="text-xs font-black uppercase tracking-wider text-stone-900">
                Top Star Highlights
              </h2>
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                Most Loved
              </span>
            </div>
            <span className="text-[10px] font-bold text-stone-600">
              Table {tableNumber} Favorites
            </span>
          </div>

          <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-none px-4 pb-2">
            {topBestsellers.map((starDish) => {
              const inCartCount = cart[starDish.id]?.qty || 0;
              return (
                <div
                  key={`star-${starDish.id}`}
                  className="w-40 shrink-0 snap-start rounded-2xl border border-stone-200/90 bg-white p-2.5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between select-none relative"
                >
                  <div
                    onClick={() => {
                      triggerHaptic(6);
                      setPreviewDish(starDish);
                    }}
                    className="cursor-pointer group"
                  >
                    <div className="w-full h-24 rounded-xl overflow-hidden relative bg-stone-100 mb-2">
                      {starDish.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={starDish.photo_url}
                          alt={starDish.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 text-2xl">
                          <span>{starDish.is_veg ? "🥗" : "🍗"}</span>
                        </div>
                      )}
                      <div className="absolute top-1 left-1">
                        <span
                          className={
                            starDish.is_veg
                              ? "veg-indicator"
                              : "nonveg-indicator"
                          }
                        />
                      </div>
                      <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-[9px] font-black text-amber-300 flex items-center gap-0.5">
                        <span>★</span>
                        <span>4.8</span>
                      </div>
                    </div>

                    <h3 className="text-xs font-bold text-stone-900 leading-snug line-clamp-1">
                      {starDish.name}
                    </h3>
                    <p className="text-[11px] font-black text-stone-900 mt-0.5">
                      ₹{starDish.price}
                    </p>
                  </div>

                  <div className="mt-2 pt-1.5 border-t border-stone-100 flex items-center justify-between">
                    {inCartCount === 0 ? (
                      <button
                        type="button"
                        onClick={(e) => addToCart(starDish.id, e)}
                        className="w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-xs active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1"
                        style={{
                          backgroundColor: "var(--rust)",
                          color: "var(--rust-text)",
                        }}
                      >
                        <span>ADD</span>
                        <span>+</span>
                      </button>
                    ) : (
                      <div
                        className="w-full h-7 flex items-center justify-between rounded-lg border shadow-xs overflow-hidden bg-white animate-spring-bounce"
                        style={{ borderColor: "var(--rust)" }}
                      >
                        <button
                          type="button"
                          onClick={() => removeFromCart(starDish.id)}
                          className="w-6 h-full flex items-center justify-center font-bold text-xs cursor-pointer hover:bg-stone-100 transition-colors"
                          style={{ color: "var(--rust)" }}
                        >
                          -
                        </button>
                        <span
                          className="font-receipt text-xs font-black px-1 min-w-[16px] text-center"
                          style={{ color: "var(--ink)" }}
                        >
                          {inCartCount}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => addToCart(starDish.id, e)}
                          className="w-6 h-full flex items-center justify-center font-bold text-xs cursor-pointer hover:bg-stone-100 transition-colors"
                          style={{ color: "var(--rust)" }}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search Bar with Misspelling Tolerance & Dietary Filter Pills */}
      <div id="menu-catalog-start" className="p-4 pb-2 space-y-2.5">
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

        {/* 5 Fast Dietary & Quick Filter Buttons */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(8);
              setDietFilter(dietFilter === "veg" ? "all" : "veg");
            }}
            className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs shrink-0 ${
              dietFilter === "veg"
                ? "bg-emerald-100 text-emerald-800 border-emerald-500 ring-1 ring-emerald-500"
                : "bg-white text-stone-700 border-stone-200"
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
            className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs shrink-0 ${
              dietFilter === "nonveg"
                ? "bg-red-100 text-red-800 border-red-500 ring-1 ring-red-500"
                : "bg-white text-stone-700 border-stone-200"
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
            className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs shrink-0 ${
              dietFilter === "bestseller"
                ? "bg-amber-100 text-amber-900 border-amber-500 ring-1 ring-amber-500"
                : "bg-white text-stone-700 border-stone-200"
            }`}
          >
            <span>⭐</span>
            <span>Bestsellers</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic(8);
              setDietFilter(dietFilter === "under_199" ? "all" : "under_199");
            }}
            className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs shrink-0 ${
              dietFilter === "under_199"
                ? "bg-blue-100 text-blue-900 border-blue-500 ring-1 ring-blue-500"
                : "bg-white text-stone-700 border-stone-200"
            }`}
          >
            <span>💰</span>
            <span>Under ₹199</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic(8);
              setDietFilter(dietFilter === "spicy" ? "all" : "spicy");
            }}
            className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs shrink-0 ${
              dietFilter === "spicy"
                ? "bg-orange-100 text-orange-950 border-orange-500 ring-1 ring-orange-500"
                : "bg-white text-stone-700 border-stone-200"
            }`}
          >
            <span>🌶️</span>
            <span>Spicy</span>
          </button>

          {dietFilter !== "all" && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic(6);
                setDietFilter("all");
              }}
              className="px-2 py-1.5 text-[11px] text-stone-400 hover:text-stone-700 cursor-pointer shrink-0"
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

      {/* 1-Tap Quick Adds Carousel: Garam Rotis, Cold Drinks, Bestsellers */}
      {quickReorderCandidates.length > 0 && selectedCat === "all" && !searchQuery && (
        <div className="px-4 mb-2">
          <div className="flex items-center justify-between pb-2">
            <div className="flex items-center gap-1.5 text-xs font-extrabold" style={{ color: "var(--ink)" }}>
              <span className="text-amber-500 animate-pulse text-sm">⚡</span>
              <span>1-Tap Quick Adds</span>
              <span className="text-[10px] font-normal text-stone-500">
                (Hot Rotis, Cold Drinks & Extras)
              </span>
            </div>
            {quickAddNotice && (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 animate-fade-in">
                ✓ {quickAddNotice}
              </span>
            )}
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-2 pt-0.5 scrollbar-none">
            {quickReorderCandidates.map((qItem) => {
              const inCartQty = cart[qItem.id]?.qty || 0;
              const emoji = getFoodEmoji(qItem.name, qItem.is_veg);
              return (
                <div
                  key={qItem.id}
                  className="flex-shrink-0 w-36 sm:w-40 p-2.5 rounded-2xl border bg-white shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                  style={{ borderColor: inCartQty > 0 ? "var(--rust)" : "var(--hairline)" }}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="text-2xl">{emoji}</span>
                    <span className={qItem.is_veg ? "veg-indicator" : "nonveg-indicator"} />
                  </div>

                  <div className="my-1">
                    <div
                      onClick={() => setPreviewDish(qItem)}
                      className="font-bold text-xs leading-snug text-stone-900 line-clamp-1 cursor-pointer hover:underline"
                      title={qItem.name}
                    >
                      {qItem.name}
                    </div>
                    <div className="font-receipt text-xs font-black text-stone-800 pt-0.5">
                      ₹{qItem.price}
                    </div>
                  </div>

                  <div className="mt-1">
                    {inCartQty === 0 ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          addToCart(qItem.id, e);
                          setQuickAddNotice(`${qItem.name} added!`);
                          setTimeout(() => setQuickAddNotice(""), 2000);
                        }}
                        className="w-full py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-xs active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1"
                        style={{
                          backgroundColor: "var(--rust)",
                          color: "var(--rust-text)",
                        }}
                      >
                        <span>+ ADD</span>
                      </button>
                    ) : (
                      <div
                        className="h-7 flex items-center justify-between rounded-xl border shadow-xs overflow-hidden bg-white"
                        style={{ borderColor: "var(--rust)" }}
                      >
                        <button
                          type="button"
                          onClick={() => removeFromCart(qItem.id)}
                          className="w-7 h-full flex items-center justify-center font-bold text-xs cursor-pointer hover:bg-stone-100"
                          style={{ color: "var(--rust)" }}
                        >
                          -
                        </button>
                        <span className="font-receipt text-xs font-black px-1 text-center" style={{ color: "var(--ink)" }}>
                          {inCartQty}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => addToCart(qItem.id, e)}
                          className="w-7 h-full flex items-center justify-center font-bold text-xs cursor-pointer hover:bg-stone-100"
                          style={{ color: "var(--rust)" }}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
            const spiciness = getSpiciness(item.name, item.description);

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

                      {/* Spiciness Indicator Badge */}
                      {spiciness === "spicy" ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-0.5">
                          <span>🌶️🌶️</span>
                          <span>Spicy</span>
                        </span>
                      ) : spiciness === "mild" ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-0.5">
                          <span>🟢</span>
                          <span>Mild</span>
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-0.5">
                          <span>🌶️</span>
                          <span>Medium</span>
                        </span>
                      )}

                      {/* Bestseller Shimmer Badge */}
                      {item.is_bestseller && (
                        <span className="shimmer-badge text-[9px] font-black px-2 py-0.5 rounded-full text-stone-900 uppercase tracking-wider shadow-2xs inline-flex items-center gap-0.5">
                          <span>★</span>
                          <span>Bestseller</span>
                        </span>
                      )}

                      <span
                        onClick={() => setPreviewDish(item)}
                        className="font-bold text-sm leading-tight text-stone-900 cursor-pointer hover:underline block w-full mt-0.5"
                      >
                        {item.name}
                      </span>
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
                          onClick={(e) => addToCart(item.id, e)}
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
                          className="h-7 flex items-center rounded-md border shadow-md overflow-hidden bg-white animate-spring-bounce"
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
                            onClick={(e) => addToCart(item.id, e)}
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
              className={`w-full h-14 px-5 rounded-2xl flex items-center justify-between shadow-2xl active:scale-[0.99] transition-all cursor-pointer border backdrop-blur ${
                isCartBouncing ? "cart-bounce" : ""
              }`}
              style={{
                backgroundColor: "var(--dark-surface)",
                borderColor: "var(--hairline)",
                color: "#FFFFFF",
              }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shadow-sm"
                  style={{
                    backgroundColor: "var(--rust)",
                    color: "var(--rust-text)",
                  }}
                >
                  {totalCartCount}
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold leading-tight">Review Table Ticket</div>
                  <div className="text-[11px] opacity-90 font-receipt flex items-center gap-1.5">
                    <span>₹{grandTotal} incl. GST</span>
                    {discountAmount > 0 && (
                      <span className="text-emerald-300 font-extrabold text-[10px]">
                        (Saved ₹{discountAmount}!)
                      </span>
                    )}
                  </div>
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

      {/* Floating Order Journey Capsule (Zomato / Swiggy Mode) */}
      {activeOrder &&
        activeOrder.order_items.length > 0 &&
        currentJourneyLayout === "floating_capsule" &&
        !isJourneySheetOpen &&
        !isReviewOpen &&
        !isCallModalOpen && (
          <div
            className={`fixed left-4 right-4 z-40 max-w-md mx-auto pointer-events-none transition-all duration-300 ${
              totalCartCount > 0 ? "bottom-20" : "bottom-4"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                triggerHaptic(12);
                setIsJourneySheetOpen(true);
              }}
              className="w-full p-2.5 sm:p-3 rounded-2xl shadow-2xl flex items-center justify-between cursor-pointer pointer-events-auto border backdrop-blur-md transition-all active:scale-[0.98]"
              style={{
                backgroundColor: "rgba(24, 20, 16, 0.95)",
                borderColor: isApprovalPending
                  ? "rgba(245, 158, 11, 0.5)"
                  : activeStage === "preparing"
                  ? "rgba(59, 130, 246, 0.5)"
                  : activeStage === "served"
                  ? "rgba(16, 185, 129, 0.5)"
                  : "rgba(217, 107, 39, 0.5)",
                color: "#FFFFFF",
                boxShadow: "0 10px 30px -4px rgba(0, 0, 0, 0.5)",
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 shadow-xs"
                  style={{
                    backgroundColor: isApprovalPending
                      ? "rgba(245, 158, 11, 0.2)"
                      : activeStage === "preparing"
                      ? "rgba(59, 130, 246, 0.2)"
                      : activeStage === "served"
                      ? "rgba(16, 185, 129, 0.2)"
                      : "rgba(217, 107, 39, 0.2)",
                    border: "1px solid",
                    borderColor: isApprovalPending
                      ? "rgba(245, 158, 11, 0.4)"
                      : activeStage === "preparing"
                      ? "rgba(59, 130, 246, 0.4)"
                      : activeStage === "served"
                      ? "rgba(16, 185, 129, 0.4)"
                      : "rgba(217, 107, 39, 0.4)",
                  }}
                >
                  {activeStage === "served"
                    ? "🍽️"
                    : activeStage === "preparing"
                    ? "🔥"
                    : isApprovalPending
                    ? "👨‍💼"
                    : "📱"}
                </div>
                <div className="min-w-0 text-left">
                  <div className="text-xs font-black tracking-wide flex items-center gap-1.5 text-stone-100">
                    <span className="truncate">
                      {isApprovalPending
                        ? "Captain Verifying Order"
                        : activeStage === "preparing"
                        ? "Chef Cooking in Kitchen"
                        : activeStage === "served"
                        ? "Dishes Served at Table"
                        : "Order Registered"}
                    </span>
                    {activeStage === "preparing" && remainingMinutesText && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-900/60 text-blue-200 border border-blue-500/40 font-bold shrink-0">
                        ⏳ {remainingMinutesText}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-stone-400 truncate">
                    Table {tableNumber} • {activeOrder.order_items.length} items (₹
                    {activeOrder.order_items.reduce(
                      (s, it) => s + Number(it.unit_price) * Number(it.qty),
                      0
                    )}
                    )
                  </div>
                </div>
              </div>

              <div
                className="flex items-center gap-1 shrink-0 text-[11px] font-black px-3 py-1.5 rounded-xl shadow-xs"
                style={{
                  backgroundColor: isApprovalPending
                    ? "#D97706"
                    : activeStage === "preparing"
                    ? "#2563EB"
                    : activeStage === "served"
                    ? "#059669"
                    : "#D96B27",
                  color: "#FFFFFF",
                }}
              >
                <span>Track</span>
                <span className="text-xs">▴</span>
              </div>
            </button>
          </div>
        )}

      {/* Floating Category Jump Button (Swiggy / Zomato style) */}
      {!isReviewOpen && !isCallModalOpen && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic(12);
            setIsCategorySheetOpen(true);
          }}
          className={`fixed z-40 flex items-center gap-1.5 px-3.5 py-2 rounded-full shadow-2xl active:scale-95 transition-all cursor-pointer border backdrop-blur ${
            activeOrder &&
            activeOrder.order_items.length > 0 &&
            currentJourneyLayout === "floating_capsule" &&
            !isJourneySheetOpen
              ? totalCartCount > 0
                ? "bottom-36 left-4"
                : "bottom-20 left-4"
              : totalCartCount > 0
              ? "bottom-20 left-4"
              : "bottom-5 left-4"
          }`}
          style={{
            backgroundColor: "rgba(31, 41, 55, 0.95)",
            color: "#F9FAFB",
            borderColor: "rgba(255, 190, 11, 0.4)",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
          }}
        >
          <span className="text-sm">📖</span>
          <span className="text-xs font-bold tracking-wide">Menu</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-400 text-stone-900 font-extrabold">
            {categories.length}
          </span>
        </button>
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
            activeOrder &&
            activeOrder.order_items.length > 0 &&
            currentJourneyLayout === "floating_capsule" &&
            !isJourneySheetOpen
              ? totalCartCount > 0
                ? "bottom-36 right-4"
                : "bottom-20 right-4"
              : totalCartCount > 0
              ? "bottom-20 right-4"
              : "bottom-5 right-4"
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

      {/* Slide-Up Bottom Sheet Drawer for Live Order Journey (Mode 1: floating_capsule) */}
      {isJourneySheetOpen && activeOrder && activeOrder.order_items.length > 0 && (() => {
        const orderTotal = activeOrder.order_items.reduce(
          (sum, it) => sum + Number(it.unit_price) * Number(it.qty),
          0
        );

        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center backdrop-blur-sm animate-fade-in p-0 sm:p-4"
            style={{ backgroundColor: "rgba(20, 16, 12, 0.65)" }}
            onClick={() => setIsJourneySheetOpen(false)}
          >
            <div
              className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up"
              style={{ borderColor: "var(--hairline)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top Drag Handle */}
              <div className="w-12 h-1.5 bg-stone-300 rounded-full mx-auto mt-3 mb-1 shrink-0" />

              {/* Sheet Header */}
              <div
                className="p-4 border-b flex items-center justify-between bg-stone-50/80"
                style={{ borderColor: "var(--hairline)" }}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">
                    {activeStage === "served"
                      ? "🍽️"
                      : activeStage === "preparing"
                      ? "🔥"
                      : isApprovalPending
                      ? "👨‍💼"
                      : "📱"}
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-heading text-xs font-black uppercase tracking-wider text-stone-900">
                        Live Order Journey
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-200 text-stone-800 font-bold">
                        #{activeOrder.id.slice(0, 6)}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-500 font-medium">
                      Table {tableNumber} • {activeOrder.order_items.length} dishes (₹{orderTotal})
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
                    style={{
                      backgroundColor:
                        isApprovalPending ? "#FFFBEB" : activeStage === "preparing" ? "#EFF6FF" : activeStage === "served" ? "#E8F5E9" : "#F3F4F6",
                      color:
                        isApprovalPending ? "#B45309" : activeStage === "preparing" ? "#1D4ED8" : activeStage === "served" ? "#15803D" : "#374151",
                    }}
                  >
                    {isApprovalPending ? "Verifying" : activeStage === "preparing" ? "Cooking" : activeStage === "served" ? "Served" : "Placed"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsJourneySheetOpen(false)}
                    className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center font-bold text-xs cursor-pointer transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="p-4 overflow-y-auto space-y-4">
                {/* 4-Station Stepper Roadmap */}
                <div className="relative py-2">
                  <div className="absolute left-6 right-6 top-6 h-1.5 bg-stone-200 rounded-full" />
                  <div
                    className="absolute left-6 top-6 h-1.5 bg-gradient-to-r from-emerald-500 via-amber-500 to-sky-500 rounded-full transition-all duration-700"
                    style={{
                      width:
                        activeStage === "served"
                          ? "calc(100% - 3rem)"
                          : activeStage === "preparing"
                          ? "66%"
                          : isApprovalPending
                          ? "33%"
                          : "12%",
                    }}
                  />

                  <div className="relative flex items-start justify-between z-10">
                    {/* Station 1: Your Table */}
                    <div className="flex flex-col items-center w-16 text-center">
                      <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-black shadow-md ring-4 ring-emerald-100">
                        ✓
                      </div>
                      <span className="text-[10px] font-black mt-1.5 text-stone-900 leading-tight">Your Table</span>
                      <span className="text-[9px] text-emerald-700 font-bold">Placed</span>
                    </div>

                    {/* Station 2: Captain */}
                    <div className="flex flex-col items-center w-16 text-center">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shadow-md transition-all ${
                          activeStage === "preparing" || activeStage === "served"
                            ? "bg-emerald-600 text-white ring-4 ring-emerald-100"
                            : isApprovalPending
                            ? "bg-amber-500 text-stone-900 ring-4 ring-amber-200 animate-pulse"
                            : "bg-emerald-600 text-white ring-4 ring-emerald-100"
                        }`}
                      >
                        {activeStage === "preparing" || activeStage === "served" || !isApprovalPending ? "✓" : "👨‍💼"}
                      </div>
                      <span className="text-[10px] font-black mt-1.5 text-stone-900 leading-tight">Captain</span>
                      <span
                        className={`text-[9px] font-bold ${
                          isApprovalPending ? "text-amber-700 animate-pulse" : "text-emerald-700"
                        }`}
                      >
                        {isApprovalPending ? "Verifying" : "Approved"}
                      </span>
                    </div>

                    {/* Station 3: Kitchen */}
                    <div className="flex flex-col items-center w-16 text-center">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shadow-md transition-all ${
                          activeStage === "served"
                            ? "bg-emerald-600 text-white ring-4 ring-emerald-100"
                            : activeStage === "preparing"
                            ? "bg-blue-600 text-white ring-4 ring-blue-200 animate-pulse"
                            : "bg-stone-200 text-stone-500 ring-2 ring-stone-100"
                        }`}
                      >
                        {activeStage === "served" ? "✓" : activeStage === "preparing" ? "🔥" : "👨‍🍳"}
                      </div>
                      <span className="text-[10px] font-black mt-1.5 text-stone-900 leading-tight">Kitchen</span>
                      <span
                        className={`text-[9px] font-bold ${
                          activeStage === "preparing"
                            ? "text-blue-700 font-bold"
                            : activeStage === "served"
                            ? "text-emerald-700"
                            : "text-stone-400"
                        }`}
                      >
                        {activeStage === "preparing"
                          ? remainingMinutesText ? `${remainingMinutesText}` : "Cooking"
                          : activeStage === "served" ? "Cooked" : "Pending"}
                      </span>
                    </div>

                    {/* Station 4: Served */}
                    <div className="flex flex-col items-center w-16 text-center">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shadow-md transition-all ${
                          activeStage === "served"
                            ? "bg-emerald-600 text-white ring-4 ring-emerald-200 animate-bounce"
                            : "bg-stone-200 text-stone-500 ring-2 ring-stone-100"
                        }`}
                      >
                        {activeStage === "served" ? "✨" : "🍽️"}
                      </div>
                      <span className="text-[10px] font-black mt-1.5 text-stone-900 leading-tight">Served</span>
                      <span
                        className={`text-[9px] font-bold ${
                          activeStage === "served" ? "text-emerald-700" : "text-stone-400"
                        }`}
                      >
                        {activeStage === "served" ? "At Table" : "Final"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Dynamic Station Narrative Note */}
                <div
                  className="p-3 rounded-xl border flex items-start gap-2.5 text-xs"
                  style={{
                    backgroundColor:
                      isApprovalPending ? "#FFFBEB" : activeStage === "preparing" ? "#EFF6FF" : activeStage === "served" ? "#F0FDF4" : "#FAF8F5",
                    borderColor:
                      isApprovalPending ? "#FDE68A" : activeStage === "preparing" ? "#BFDBFE" : activeStage === "served" ? "#BBF7D0" : "var(--hairline)",
                  }}
                >
                  <span className="text-xl shrink-0 mt-0.5">
                    {isApprovalPending ? "👨‍💼" : activeStage === "preparing" ? "🍳" : activeStage === "served" ? "🎉" : "📍"}
                  </span>
                  <div>
                    <div className="font-heading font-black text-xs text-stone-900 mb-0.5">
                      {isApprovalPending
                        ? `Captain Verification at Table ${tableNumber}`
                        : activeStage === "preparing"
                        ? `Chef is Cooking in the Kitchen`
                        : activeStage === "served"
                        ? `All Dishes Delivered to Table ${tableNumber}!`
                        : `Order Dispatched from Table ${tableNumber}`}
                    </div>
                    <div className="text-[11px] text-stone-600 leading-relaxed">
                      {isApprovalPending
                        ? "Our floor captain is reviewing the order items with you before sending the fire ticket (KOT) to the kitchen stoves."
                        : activeStage === "preparing"
                        ? `The kitchen station has fired your ticket and is preparing dishes fresh.${remainingMinutesText ? ` Target cooking time: ${remainingMinutesText} remaining.` : ""}`
                        : activeStage === "served"
                        ? "Hope you enjoy your meal! Need extra dips, water, or the bill? Tap 'Call Waiter' anytime."
                        : "Order has been registered from your phone. Traveling to the service captain."}
                    </div>
                  </div>
                </div>

                {/* Mystery Scratch Reward Card prompt when food is served */}
                {activeStage === "served" && features.loyaltyOffers !== false && (
                  <div
                    onClick={() => {
                      triggerHaptic(18);
                      setIsScratchModalOpen(true);
                    }}
                    className="p-3 rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 border border-amber-500 text-stone-900 shadow-md cursor-pointer active:scale-98 transition-transform flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl animate-bounce">🎁</span>
                      <div className="text-left">
                        <div className="text-xs font-black leading-tight">Scratch Mystery Voucher!</div>
                        <div className="text-[10px] font-medium text-amber-950">
                          {offerConfig.bounceBackReward || "Flat ₹100 OFF on your next visit"}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-black px-2.5 py-1.5 rounded-lg bg-stone-900 text-amber-300 shadow-xs flex items-center gap-1">
                      <span>Scratch</span>
                      <span>➔</span>
                    </span>
                  </div>
                )}

                {/* Dishes In Ticket (2-line layout, zero truncation!) */}
                <div className="space-y-2 pt-2 border-t border-dashed" style={{ borderColor: "var(--hairline)" }}>
                  <div className="text-[11px] font-mono font-bold text-stone-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Dishes in this order ({activeOrder.order_items.length}):</span>
                    <span className="text-stone-900 font-black font-receipt">Total: ₹{orderTotal}</span>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {activeOrder.order_items.map((it) => (
                      <div
                        key={it.id}
                        className="p-2.5 rounded-xl bg-stone-50/90 border border-stone-200/90 hover:border-stone-300 transition-all text-xs space-y-1.5"
                      >
                        {/* Line 1: Veg indicator + Full Dish Name (100% width, no truncation) + Item Price */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className={`${it.menu_items?.is_veg ? "veg-indicator" : "nonveg-indicator"} shrink-0 mt-0.5`} />
                            <span className="font-bold text-stone-900 text-xs sm:text-sm leading-snug break-words">
                              {it.menu_items?.name || "Dish"}
                            </span>
                          </div>
                          <span className="font-mono font-black text-stone-900 text-xs sm:text-sm shrink-0 whitespace-nowrap">
                            ₹{Number(it.unit_price) * Number(it.qty)}
                          </span>
                        </div>

                        {/* Line 2: Quantity, Unit Price, Status Badge, and 1-Tap Repeat Button */}
                        <div className="flex items-center justify-between pt-1 border-t border-stone-200/50 text-[11px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-stone-600 bg-stone-200/60 px-1.5 py-0.5 rounded text-[10px]">
                              {it.qty}×
                            </span>
                            {it.item_status === "served" ? (
                              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1 shrink-0">
                                <span>✓</span> Ready
                              </span>
                            ) : it.item_status === "preparing" ? (
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full border border-blue-300 animate-pulse flex items-center gap-1 shrink-0">
                                <span>🔥</span> Cooking
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-300 flex items-center gap-1 shrink-0">
                                <span>⏳</span> Queued
                              </span>
                            )}
                            <span className="text-[10px] text-stone-400 font-mono">
                              (₹{it.unit_price}/ea)
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleReorderItem(it)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold border bg-white hover:bg-stone-100 cursor-pointer shadow-2xs transition-transform active:scale-95 flex items-center gap-1"
                            style={{ borderColor: "var(--hairline)", color: "var(--rust)" }}
                          >
                            <span>+</span> Repeat
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="p-3.5 border-t bg-stone-50 flex items-center gap-2.5" style={{ borderColor: "var(--hairline)" }}>
                {features.callWaiter && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsJourneySheetOpen(false);
                      setIsCallModalOpen(true);
                    }}
                    className="flex-1 py-2.5 px-3 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 font-bold text-xs text-stone-800 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-98 transition-transform"
                  >
                    <span>🛎️</span>
                    <span>Call Waiter</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsJourneySheetOpen(false);
                    const el = document.getElementById("menu-catalog-start");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-98 transition-transform"
                  style={{ backgroundColor: "var(--rust)", color: "var(--rust-text)" }}
                >
                  <span>🍲</span>
                  <span>Add More Food</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Flying Particle Micro-Interaction Overlay */}
      {flyingParticles.map((p) => (
        <div
          key={p.id}
          className="flying-dot flex items-center justify-center w-8 h-8 rounded-full bg-amber-400 text-stone-900 font-black text-sm shadow-2xl border border-stone-900"
          style={{
            left: `${p.x}px`,
            top: `${p.y}px`,
            // @ts-expect-error CSS variable
            "--tx": `${p.tx}px`,
            "--ty": `${p.ty}px`,
          }}
        >
          {p.emoji}
        </div>
      ))}

      {/* Floating Category Quick-Jump Sheet Modal (Swiggy / Zomato style) */}
      {isCategorySheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center backdrop-blur-sm"
          style={{ backgroundColor: "rgba(34, 29, 22, 0.6)" }}
          onClick={() => setIsCategorySheetOpen(false)}
        >
          <div
            className="w-full max-w-md max-h-[75vh] p-5 rounded-t-3xl flex flex-col justify-between overflow-y-auto shadow-2xl border-t-2 animate-slide-up bg-white"
            style={{ borderColor: "var(--hairline)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="w-12 h-1.5 bg-stone-300 rounded-full mx-auto mb-3" />

              <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                <div>
                  <h3 className="font-heading text-xl font-bold text-stone-900">
                    Menu Categories
                  </h3>
                  <p className="text-xs text-stone-500">
                    {categories.length} categories · {items.length} total dishes
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCategorySheetOpen(false)}
                  className="w-8 h-8 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center font-bold text-xs cursor-pointer hover:bg-stone-200"
                >
                  ✕
                </button>
              </div>

              {/* Category Grid */}
              <div className="grid grid-cols-2 gap-2.5 my-4">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(10);
                    setSelectedCat("all");
                    setIsCategorySheetOpen(false);
                  }}
                  className={`p-3 rounded-2xl border flex items-center justify-between text-left cursor-pointer transition-all active:scale-95 ${
                    selectedCat === "all"
                      ? "bg-amber-100 border-amber-500 text-amber-900 font-bold shadow-xs"
                      : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🍽️</span>
                    <span className="text-xs">All Dishes</span>
                  </div>
                  <span className="font-mono text-xs opacity-75">({items.length})</span>
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
                        triggerHaptic(10);
                        setSelectedCat(cat.id);
                        setIsCategorySheetOpen(false);
                      }}
                      className={`p-3 rounded-2xl border flex items-center justify-between text-left cursor-pointer transition-all active:scale-95 ${
                        isSelected
                          ? "bg-amber-100 border-amber-500 text-amber-900 font-bold shadow-xs"
                          : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate pr-1">
                        <span className="text-xl flex-shrink-0">{icon}</span>
                        <span className="text-xs truncate">{cat.name}</span>
                      </div>
                      <span className="font-mono text-xs opacity-75 flex-shrink-0">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCategorySheetOpen(false)}
              className="w-full py-2.5 rounded-xl border border-stone-200 text-xs font-bold text-stone-600 cursor-pointer hover:bg-stone-50"
            >
              Close Menu
            </button>
          </div>
        </div>
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

              {/* Spend Goal Proximity Progress Nudge */}
              {upsellConfig.showSpendGoalNudge && offerConfig.active && (
                <div className="my-3 p-3 rounded-2xl border bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10 border-amber-500/30">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold flex items-center gap-1.5 text-amber-900">
                      <span>🎯</span>
                      {subtotalCart >= offerConfig.minOrderValue ? (
                        <span className="text-emerald-700 font-extrabold">🎉 FLAT {offerConfig.discountPercent}% OFF Unlocked!</span>
                      ) : (
                        <span>
                          Add <strong className="text-amber-950 font-receipt">₹{Math.max(0, offerConfig.minOrderValue - subtotalCart)}</strong> to unlock <strong>{offerConfig.discountPercent}% OFF</strong>
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-amber-800">
                      ₹{subtotalCart}/₹{offerConfig.minOrderValue}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-stone-200/80 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        subtotalCart >= offerConfig.minOrderValue
                          ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                          : "bg-gradient-to-r from-amber-500 to-orange-500"
                      }`}
                      style={{
                        width: `${Math.min(100, Math.round((subtotalCart / (offerConfig.minOrderValue || 1)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Smart Upsell & Basket Pairing Recommendations */}
              {features.smartUpsell && upsellConfig.enabled && upsellCandidates.length > 0 && (
                <div className="my-3 p-3 rounded-2xl border bg-stone-50/90 shadow-xs" style={{ borderColor: "var(--hairline)" }}>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">💡</span>
                      <div>
                        <div className="text-xs font-bold" style={{ color: "var(--ink)" }}>
                          {upsellConfig.headline || "Frequently Ordered Together"}
                        </div>
                        <div className="text-[10px]" style={{ color: "var(--ink-soft)" }}>
                          Intelligent pairings based on your selections
                        </div>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                      Smart AI
                    </span>
                  </div>

                  <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none snap-x">
                    {upsellCandidates.map((upsell) => (
                      <div
                        key={upsell.id}
                        className="p-2.5 rounded-xl bg-white border flex flex-col justify-between shadow-xs shrink-0 w-36 snap-start transition-all hover:border-amber-400"
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className={upsell.is_veg ? "veg-indicator" : "nonveg-indicator"} />
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-700 truncate max-w-[95px] flex items-center gap-0.5">
                              <span>{upsell.reasonIcon}</span>
                              <span className="truncate">{upsell.reasonTag}</span>
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {upsell.photo_url ? (
                              <img
                                src={upsell.photo_url}
                                alt={upsell.name}
                                className="w-8 h-8 rounded-lg object-cover shrink-0"
                              />
                            ) : (
                              <span className="text-xl shrink-0">{getFoodEmoji(upsell.name, upsell.is_veg)}</span>
                            )}
                            <div className="text-[11px] font-bold leading-tight line-clamp-2 text-stone-900">
                              {upsell.name}
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 mt-1.5 border-t border-dashed border-stone-200 flex items-center justify-between">
                          <span className="font-receipt font-extrabold text-xs text-stone-900">
                            ₹{upsell.price}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => addToCart(upsell.id, e)}
                            className="px-2 py-1 rounded-lg flex items-center gap-1 font-bold text-[10px] cursor-pointer shadow-xs active:scale-95 transition-all"
                            style={{ backgroundColor: "var(--rust)", color: "var(--rust-text)" }}
                          >
                            <span>+</span>
                            <span>Add</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Indian Tax Breakdown & Offer Discount */}
              <div className="pt-3.5 border-t border-dashed space-y-1.5 font-receipt text-xs" style={{ borderColor: "var(--hairline)" }}>
                <div className="flex justify-between" style={{ color: "var(--ink-soft)" }}>
                  <span>Items Subtotal</span>
                  <span>₹{subtotalCart.toLocaleString("en-IN")}</span>
                </div>

                {discountAmount > 0 ? (
                  <div className="flex justify-between items-center py-1.5 px-2.5 rounded-lg bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                    <span className="flex items-center gap-1.5">
                      <span>🎁</span>
                      <span>Table Offer ({offerConfig.discountPercent}% OFF)</span>
                    </span>
                    <span className="font-extrabold">-₹{discountAmount.toLocaleString("en-IN")}</span>
                  </div>
                ) : (
                  offerConfig.active && (
                    <div className="text-[10px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 flex items-center justify-between font-medium">
                      <span>💡 Add ₹{Math.max(0, offerConfig.minOrderValue - subtotalCart)} more to unlock {offerConfig.discountPercent}% OFF</span>
                      <span className="font-bold text-amber-900">FLAT {offerConfig.discountPercent}%</span>
                    </div>
                  )
                )}

                <div className="flex justify-between" style={{ color: "var(--ink-soft)" }}>
                  <span>CGST (2.5%)</span>
                  <span>₹{cgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between" style={{ color: "var(--ink-soft)" }}>
                  <span>SGST (2.5%)</span>
                  <span>₹{sgst.toFixed(2)}</span>
                </div>
                <div className="pt-2.5 flex justify-between items-baseline border-t border-stone-300">
                  <div>
                    <span className="font-heading text-sm font-extrabold block" style={{ color: "var(--ink)" }}>
                      Total Payable
                    </span>
                    {discountAmount > 0 && (
                      <span className="text-[10px] font-bold text-emerald-700 block">
                        🎉 Total savings: ₹{discountAmount}
                      </span>
                    )}
                  </div>
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

                    {/* Spiciness Indicator Badge in Preview */}
                    {(() => {
                      const spice = getSpiciness(previewDish.name, previewDish.description);
                      if (spice === "spicy") {
                        return (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-0.5">
                            <span>🌶️🌶️</span>
                            <span>Hot & Spicy</span>
                          </span>
                        );
                      }
                      if (spice === "mild") {
                        return (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-0.5">
                            <span>🟢</span>
                            <span>Mild & Gentle</span>
                          </span>
                        );
                      }
                      return (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-0.5">
                          <span>🌶️</span>
                          <span>Medium Spice</span>
                        </span>
                      );
                    })()}

                    {previewDish.is_bestseller && (
                      <span className="shimmer-badge text-[10px] font-black px-2.5 py-0.5 rounded-full text-stone-900 uppercase tracking-wider shadow-xs inline-flex items-center gap-0.5">
                        <span>★</span>
                        <span>Chef's Bestseller</span>
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
                  onClick={(e) => {
                    addToCart(previewDish.id, e);
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
                      onClick={(e) => addToCart(previewDish.id, e)}
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

      {/* Google Pay Style Interactive Scratch Card Modal */}
      <ScratchCardModal
        isOpen={isScratchModalOpen}
        onClose={() => setIsScratchModalOpen(false)}
        data={{
          restaurantName,
          tableNumber,
          rewardTitle: offerConfig.bounceBackReward || "Flat ₹100 OFF on your next visit",
          rewardSubtitle: `Valid on orders above ₹${offerConfig.minOrderValue || 399} on your next visit`,
          voucherCode: `${offerConfig.bounceBackCode || "REPEAT100"}-T${tableNumber.replace(/\D/g, "") || "4"}`,
          shareUrl: typeof window !== "undefined" ? window.location.href : "",
          validityDays: offerConfig.validityDays || 15,
        }}
      />

      {/* Post-Order Celebratory Dispatch & Live Routing Modal */}
      {showDispatchModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300"
        >
          <div className="max-w-sm w-full bg-white rounded-3xl shadow-2xl p-6 text-center border border-amber-200 relative overflow-hidden animate-spring-bounce">
            {/* Top Glowing Beam Icon */}
            <div className="relative mx-auto w-20 h-20 mb-4 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping" />
              <div className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center text-3xl shadow-lg">
                🚀
              </div>
            </div>

            {/* Title & Tagline */}
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 inline-block mb-2">
              Order Beamed Successfully
            </span>
            <h3 className="text-lg font-black text-stone-900 leading-tight">
              Order Dispatched from Table {tableNumber}!
            </h3>
            <p className="text-xs text-stone-600 mt-2 leading-relaxed">
              Your order has been wirelessly beamed to your Floor Captain and Kitchen terminal.
            </p>

            {/* Visual Dispatch Beam Track */}
            <div className="my-5 p-3.5 rounded-2xl bg-stone-50 border border-stone-200 text-left">
              <div className="text-[10px] font-bold text-stone-600 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                <span>Dispatch Routing Path</span>
                <span className="text-emerald-700 font-black">Live ⚡</span>
              </div>
              <div className="flex items-center justify-between relative">
                {/* Connecting Track Line */}
                <div className="absolute top-4 left-4 right-4 h-0.5 bg-gradient-to-r from-emerald-500 via-amber-400 to-stone-200 -z-0" />

                {/* Node 1: Table */}
                <div className="relative z-10 flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-black shadow-xs ring-4 ring-emerald-100">
                    ✓
                  </div>
                  <span className="text-[10px] font-bold text-stone-800 mt-1">Table {tableNumber}</span>
                  <span className="text-[8px] text-emerald-600 font-semibold">Sent</span>
                </div>

                {/* Node 2: Captain */}
                <div className="relative z-10 flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs shadow-xs ring-4 ring-amber-100 animate-pulse">
                    👨‍💼
                  </div>
                  <span className="text-[10px] font-bold text-stone-800 mt-1">Captain</span>
                  <span className="text-[8px] text-amber-600 font-semibold">Verifying</span>
                </div>

                {/* Node 3: Kitchen */}
                <div className="relative z-10 flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-stone-200 text-stone-500 flex items-center justify-center text-xs shadow-xs">
                    👨‍🍳
                  </div>
                  <span className="text-[10px] font-bold text-stone-500 mt-1">Kitchen</span>
                  <span className="text-[8px] text-stone-400 font-semibold">Queued</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(12);
                  setShowDispatchModal(false);
                  const el = document.getElementById("order-journey-tracker");
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }}
                className="w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider shadow-md active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor: "var(--rust)",
                  color: "var(--rust-text)",
                }}
              >
                <span>Track Live Order Journey</span>
                <span>&rarr;</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic(6);
                  setShowDispatchModal(false);
                }}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                Browse Menu &amp; Add More Dishes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
