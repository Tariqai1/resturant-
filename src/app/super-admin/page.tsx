"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ShareMenuModal, { ShareMenuTable } from "@/components/ShareMenuModal";
import type { RestaurantFeatures } from "@/lib/platform/state";
import type {
  RestaurantThemeType,
  RestaurantBrandingConfig,
  RestaurantOfferConfig,
} from "@/lib/types/offers";
import { DEFAULT_OFFER_CONFIG, DEFAULT_BRANDING_CONFIG } from "@/lib/types/offers";

const DEFAULT_RESTAURANT_FEATURES: RestaurantFeatures = {
  callWaiter: true,
  prepTimeTracker: true,
  customRequests: true,
  tablePayUpi: true,
  dishNotes: true,
  smartUpsell: true,
  feedbackReview: true,
  loyaltyOffers: true,
  mobileNavStyle: "bottom_bar",
  mobileSheetModals: true,
  autoMobileCards: true,
};

type PlatformStats = {
  totalRestaurants: number;
  activeRestaurants: number;
  expiredRestaurants: number;
  planBreakdown: { trial: number; basic: number; pro: number };
  totalOrders: number;
  totalGmv: number;
  todayOrders: number;
  todayGmv: number;
};

type RestaurantFleetItem = {
  id: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
  contactPhone: string | null;
  gstin: string | null;
  subscriptionPlan: "trial" | "basic" | "pro";
  subscriptionStatus: "active" | "expired" | "cancelled";
  isArchived?: boolean;
  theme?: RestaurantThemeType;
  branding?: RestaurantBrandingConfig;
  features?: RestaurantFeatures;
  offerConfig?: RestaurantOfferConfig;
  tables?: ShareMenuTable[];
  firstTableToken?: string | null;
  createdAt: string;
  stats: {
    tableCount: number;
    activeTables: number;
    totalOrders: number;
    gmv: number;
    staffCount: number;
  };
};

type BroadcastState = {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "alert" | "maintenance";
  active: boolean;
  dismissible: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type ActivityItem = {
  id: string;
  action: string;
  actorEmail: string;
  targetId?: string;
  targetName?: string;
  details: string;
  createdAt: string;
};

export default function SuperAdminPage() {
  const router = useRouter();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantFleetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Tab navigation: Fleet Registry, Global Broadcast, Activity Log
  const [activeTab, setActiveTab] = useState<"fleet" | "broadcast" | "activity">("fleet");

  // Broadcast state
  const [broadcastForm, setBroadcastForm] = useState<BroadcastState>({
    id: "",
    title: "Scheduled Maintenance Window",
    message: "Platform services will undergo routine database optimization tonight at 2:00 AM IST.",
    type: "info",
    active: false,
    dismissible: true,
  });

  // Activity audit logs state
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activityFilter, setActivityFilter] = useState("all");
  const [activitySearch, setActivitySearch] = useState("");

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modals state
  const [showOnboardModal, setShowOnboardModal] = useState(false);
  const [onboardError, setOnboardError] = useState("");
  const [onboardSuccessModal, setOnboardSuccessModal] = useState<{
    id: string;
    name: string;
    ownerName: string;
    ownerEmail: string;
    contactPhone?: string;
    pin: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [editingRestaurant, setEditingRestaurant] = useState<RestaurantFleetItem | null>(null);
  const [resettingOwner, setResettingOwner] = useState<RestaurantFleetItem | null>(null);
  const [deletingRestaurant, setDeletingRestaurant] = useState<RestaurantFleetItem | null>(null);
  const [shareMenuResto, setShareMenuResto] = useState<RestaurantFleetItem | null>(null);

  // Super Admin Staff Management State
  const [managingStaffResto, setManagingStaffResto] = useState<RestaurantFleetItem | null>(null);
  type RestoStaffItem = {
    id: string;
    name: string;
    role: string;
    is_active: boolean;
    created_at: string;
    permissions?: {
      canEditOrders: boolean;
      canDeleteOrders: boolean;
      assignedPin?: string;
    };
  };
  const [restoStaffList, setRestoStaffList] = useState<RestoStaffItem[]>([]);
  const [loadingStaffList, setLoadingStaffList] = useState(false);
  const [isAddingRestoStaff, setIsAddingRestoStaff] = useState(false);
  const [showPinsMap, setShowPinsMap] = useState<Record<string, boolean>>({});
  const [newRestoStaff, setNewRestoStaff] = useState({
    name: "",
    role: "waiter",
    pin: "",
    canEditOrders: false,
    canDeleteOrders: false,
  });
  const [editingStaffPin, setEditingStaffPin] = useState<{ id: string; name: string } | null>(null);
  const [newStaffPinValue, setNewStaffPinValue] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Restaurant Form State
  const [newResto, setNewResto] = useState({
    name: "",
    ownerName: "",
    ownerEmail: "",
    contactPhone: "",
    gstin: "",
    pin: "1234",
    plan: "trial",
    tableCount: 6,
    seedSampleMenu: true,
  });

  // Owner Reset Form State
  const [resetForm, setResetForm] = useState({
    newPin: "",
    newPassword: "",
    sendRecoveryEmail: true,
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Spotlight Command Palette State
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  const [spotlightQuery, setSpotlightQuery] = useState("");

  // Slide-Over Feature Cockpit State
  const [cockpitResto, setCockpitResto] = useState<RestaurantFleetItem | null>(null);
  const [isSavingCockpit, setIsSavingCockpit] = useState(false);
  const [copiedCockpitLink, setCopiedCockpitLink] = useState(false);

  // Bulk Multi-Restaurant Selection
  const [selectedRestoIds, setSelectedRestoIds] = useState<string[]>([]);

  // Mobile Pro Drawer State
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([
      fetch("/api/super-admin/stats").then((r) => r.json()),
      fetch("/api/super-admin/restaurants").then((r) => r.json()),
      fetch("/api/super-admin/broadcast").then((r) => r.json()),
      fetch("/api/super-admin/activity").then((r) => r.json()),
    ])
      .then(([statsData, restoData, bcastData, actData]) => {
        if (!statsData.ok || !restoData.ok) {
          setError(statsData.message || restoData.message || "Failed to load platform data");
        } else {
          setStats(statsData.stats);
          setRestaurants(restoData.restaurants || []);
        }
        if (bcastData?.fullRecord) {
          setBroadcastForm(bcastData.fullRecord);
        }
        if (actData?.activities) {
          setActivities(actData.activities);
        }
      })
      .catch((err) => {
        setError(err.message || "Network error loading Super Admin desk");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      fetch("/api/super-admin/stats").then((r) => r.json()),
      fetch("/api/super-admin/restaurants").then((r) => r.json()),
      fetch("/api/super-admin/broadcast").then((r) => r.json()),
      fetch("/api/super-admin/activity").then((r) => r.json()),
    ])
      .then(([statsData, restoData, bcastData, actData]) => {
        if (!isMounted) return;
        if (!statsData.ok || !restoData.ok) {
          setError(statsData.message || restoData.message || "Failed to load platform data");
        } else {
          setStats(statsData.stats);
          setRestaurants(restoData.restaurants || []);
        }
        if (bcastData?.fullRecord) {
          setBroadcastForm(bcastData.fullRecord);
        }
        if (actData?.activities) {
          setActivities(actData.activities);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || "Network error loading Super Admin desk");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Keyboard shortcut: Ctrl+K / Cmd+K for Spotlight Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSpotlightOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsSpotlightOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filter restaurants locally based on search
  const filteredRestaurants = restaurants.filter((r) => {
    const matchesSearch =
      !searchQuery ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.ownerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.ownerEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.contactPhone && r.contactPhone.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.gstin && r.gstin.toLowerCase().includes(searchQuery.toLowerCase())) ||
      r.id.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesPlan = planFilter === "all" || r.subscriptionPlan === planFilter;
    const isArchived = Boolean(r.isArchived || r.subscriptionStatus === "cancelled");
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "archived"
        ? isArchived
        : statusFilter === "active"
        ? r.subscriptionStatus === "active" && !isArchived
        : statusFilter === "expired"
        ? r.subscriptionStatus === "expired" && !isArchived
        : r.subscriptionStatus === statusFilter;

    return matchesSearch && matchesPlan && matchesStatus;
  });

  // Spotlight search matches (instant filter by name, owner, phone, email)
  const spotlightMatches = spotlightQuery.trim()
    ? restaurants.filter(
        (r) =>
          r.name.toLowerCase().includes(spotlightQuery.toLowerCase()) ||
          r.ownerName.toLowerCase().includes(spotlightQuery.toLowerCase()) ||
          r.ownerEmail.toLowerCase().includes(spotlightQuery.toLowerCase()) ||
          (r.contactPhone && r.contactPhone.includes(spotlightQuery)) ||
          (r.gstin && r.gstin.toLowerCase().includes(spotlightQuery.toLowerCase())) ||
          r.id.toLowerCase().includes(spotlightQuery.toLowerCase())
      )
    : restaurants.slice(0, 8);

  // 1-Click Smart Presets
  const DHABA_PRESET: RestaurantFeatures = {
    callWaiter: false,
    prepTimeTracker: false,
    customRequests: true,
    tablePayUpi: true,
    dishNotes: true,
    smartUpsell: true,
    feedbackReview: false,
    mobileNavStyle: "bottom_bar",
    mobileSheetModals: true,
    autoMobileCards: true,
  };

  const FINE_DINE_PRESET: RestaurantFeatures = {
    callWaiter: true,
    prepTimeTracker: true,
    customRequests: true,
    tablePayUpi: true,
    dishNotes: true,
    smartUpsell: true,
    feedbackReview: true,
    mobileNavStyle: "bottom_bar",
    mobileSheetModals: true,
    autoMobileCards: true,
  };

  const CAFE_PRESET: RestaurantFeatures = {
    callWaiter: false,
    prepTimeTracker: true,
    customRequests: false,
    tablePayUpi: true,
    dishNotes: false,
    smartUpsell: true,
    feedbackReview: true,
    mobileNavStyle: "bottom_bar",
    mobileSheetModals: true,
    autoMobileCards: true,
  };

  const ENTERPRISE_ALL_PRESET: RestaurantFeatures = {
    callWaiter: true,
    prepTimeTracker: true,
    customRequests: true,
    tablePayUpi: true,
    dishNotes: true,
    smartUpsell: true,
    feedbackReview: true,
    mobileNavStyle: "bottom_bar",
    mobileSheetModals: true,
    autoMobileCards: true,
  };

  // 1-Click Direct Feature Toggle (Optimistic Update)
  const handleDirectToggleFeature = async (
    restaurant: RestaurantFleetItem,
    featureKey: keyof RestaurantFeatures,
    overrideValue?: unknown
  ) => {
    const currentFeats = restaurant.features || DEFAULT_RESTAURANT_FEATURES;
    const currentVal = currentFeats[featureKey];
    let nextVal: unknown;
    if (overrideValue !== undefined) {
      nextVal = overrideValue;
    } else if (featureKey === "mobileNavStyle") {
      nextVal = currentVal === "sidebar" ? "bottom_bar" : "sidebar";
    } else {
      nextVal = !currentVal;
    }

    const nextFeatures: RestaurantFeatures = {
      ...currentFeats,
      [featureKey]: nextVal,
    } as RestaurantFeatures;

    // Optimistic UI update
    setRestaurants((prev) =>
      prev.map((item) => (item.id === restaurant.id ? { ...item, features: nextFeatures } : item))
    );
    if (cockpitResto?.id === restaurant.id) {
      setCockpitResto((prev) => (prev ? { ...prev, features: nextFeatures } : null));
    }

    try {
      const res = await fetch("/api/super-admin/restaurants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: restaurant.id,
          features: nextFeatures,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to toggle feature");
      showToast(`⚡ ${String(featureKey)} toggled for "${restaurant.name}"`);
    } catch (err) {
      fetchData();
      showToast(err instanceof Error ? err.message : "Failed to toggle feature");
    }
  };

  // Bulk Apply Features across multiple selected restaurants
  const handleBulkApplyFeatures = async (features: RestaurantFeatures, label: string) => {
    if (selectedRestoIds.length === 0) return;
    const count = selectedRestoIds.length;

    setRestaurants((prev) =>
      prev.map((r) => (selectedRestoIds.includes(r.id) ? { ...r, features: { ...features } } : r))
    );

    try {
      const res = await fetch("/api/super-admin/restaurants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedRestoIds,
          features,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Bulk update failed");
      showToast(`🎉 Applied ${label} to ${count} restaurants`);
      setSelectedRestoIds([]);
      fetchData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Bulk update failed");
      fetchData();
    }
  };

  // Save Feature Cockpit
  const handleSaveCockpit = async () => {
    if (!cockpitResto) return;
    setIsSavingCockpit(true);
    try {
      const res = await fetch("/api/super-admin/restaurants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: cockpitResto.id,
          features: cockpitResto.features,
          theme: cockpitResto.theme,
          branding: cockpitResto.branding,
          offerConfig: cockpitResto.offerConfig,
          subscription_plan: cockpitResto.subscriptionPlan,
          subscription_status: cockpitResto.subscriptionStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save cockpit");
      showToast(`Cockpit saved for "${cockpitResto.name}"!`);
      fetchData();
      setCockpitResto(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save cockpit");
    } finally {
      setIsSavingCockpit(false);
    }
  };

  // WhatsApp Setup Message generator
  const getWhatsAppSetupUrl = (resto: RestaurantFleetItem) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const loginUrl = `${origin}/login?resto=${resto.id}&role=owner`;
    const feats = resto.features || DEFAULT_RESTAURANT_FEATURES;

    const activeList: string[] = [];
    if (feats.tablePayUpi) activeList.push("💳 Direct Table UPI QR (Instant Settlement)");
    if (feats.callWaiter) activeList.push("🛎️ Call Waiter & Staff Buzzer");
    if (feats.dishNotes) activeList.push("✏️ Custom Cooking Instructions Per Dish");
    if (feats.smartUpsell) activeList.push("💡 Smart Cart Pairing Upsell");
    if (feats.feedbackReview) activeList.push("⭐ 5-Star Google Review Booster");
    if (feats.prepTimeTracker) activeList.push("⏳ Live Kitchen Prep Countdown Timer");
    if (feats.mobileNavStyle === "bottom_bar") activeList.push("⚡ Mobile Bottom Bar (Thumb Optimized)");
    if (feats.autoMobileCards) activeList.push("🖼️ Touch Dish Cards for Mobile");

    const text = `🎉 *Namaste ${resto.ownerName}! Welcome to OrderDesk*\n\nYour outlet *${resto.name}* is live with premium digital POS features:\n\n✨ *Active Features*:\n${activeList.map((f) => `• ${f}`).join("\n")}\n\n📱 *Manager POS Login Link*:\n${loginUrl}\n\n👤 *Owner*: ${resto.ownerName}\n📧 *Owner Email*: ${resto.ownerEmail}\n\nOpen this link on your phone or tablet to start taking orders!`;

    const cleanPhone = (resto.contactPhone || "").replace(/\D/g, "");
    return cleanPhone
      ? `https://api.whatsapp.com/send?phone=91${cleanPhone.length === 10 ? cleanPhone : cleanPhone}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  };

  // Filter activities
  const filteredActivities = activities.filter((act) => {
    const matchesAction = activityFilter === "all" || act.action === activityFilter;
    const matchesSearch =
      !activitySearch ||
      act.actorEmail.toLowerCase().includes(activitySearch.toLowerCase()) ||
      (act.targetName && act.targetName.toLowerCase().includes(activitySearch.toLowerCase())) ||
      act.details.toLowerCase().includes(activitySearch.toLowerCase());
    return matchesAction && matchesSearch;
  });

  // Handle Quick Status Toggle
  const handleToggleStatus = (restaurant: RestaurantFleetItem) => {
    const newStatus = restaurant.subscriptionStatus === "active" ? "expired" : "active";
    startTransition(async () => {
      try {
        const res = await fetch("/api/super-admin/restaurants", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: restaurant.id, subscription_status: newStatus }),
        });
        const data = await res.json();
        if (data.ok) {
          showToast(`Restaurant ${restaurant.name} marked as ${newStatus}`);
          fetchData();
        } else {
          showToast(`Error: ${data.message}`);
        }
      } catch {
        showToast("Network error updating status");
      }
    });
  };

  const handleSuperAdminSignOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/super-admin/login");
    router.refresh();
  };

  // 1. Handle Impersonation (Ghost Mode)
  const handleImpersonate = (resto: RestaurantFleetItem) => {
    startTransition(async () => {
      try {
        showToast(`Launching Ghost Mode for "${resto.name}"...`);
        const res = await fetch("/api/super-admin/impersonate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restaurantId: resto.id }),
        });
        const data = await res.json();
        if (data.ok) {
          router.push("/");
          router.refresh();
        } else {
          showToast(`Impersonation failed: ${data.message}`);
        }
      } catch {
        showToast("Network error initiating impersonation");
      }
    });
  };

  // 2. Handle Soft Delete / Archive & Restore
  const handleArchiveToggle = (resto: RestaurantFleetItem) => {
    const isCurrentlyArchived = Boolean(resto.isArchived || resto.subscriptionStatus === "cancelled");
    const newAction = isCurrentlyArchived ? "restore" : "archive";
    startTransition(async () => {
      try {
        const res = await fetch("/api/super-admin/restaurants", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: resto.id,
            action: newAction,
            name: resto.name,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          showToast(
            isCurrentlyArchived
              ? `Restaurant "${resto.name}" restored to active fleet`
              : `Restaurant "${resto.name}" archived. Financial & GST audit records safely retained.`
          );
          fetchData();
        } else {
          showToast(`Error: ${data.message}`);
        }
      } catch {
        showToast("Network error updating archival status");
      }
    });
  };

  // 3. Handle Confirm Delete (Permanent or Archive fallback)
  const handleConfirmDelete = (permanent: boolean) => {
    if (!deletingRestaurant) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/super-admin/restaurants", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: deletingRestaurant.id,
            permanent,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          showToast(data.message || "Restaurant operation completed");
          setDeletingRestaurant(null);
          fetchData();
        } else {
          showToast(`Action blocked: ${data.message}`);
        }
      } catch {
        showToast("Failed to delete restaurant");
      }
    });
  };

  // 4. Handle Save Broadcast
  const handleSaveBroadcast = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    startTransition(async () => {
      try {
        const res = await fetch("/api/super-admin/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(broadcastForm),
        });
        const data = await res.json();
        if (data.ok) {
          showToast("Global Platform Broadcast updated!");
          fetchData();
        } else {
          showToast(`Broadcast update failed: ${data.message}`);
        }
      } catch {
        showToast("Network error saving broadcast");
      }
    });
  };

  // 5. Handle Toggle Broadcast Active/Inactive
  const handleToggleBroadcastActive = () => {
    const nextActive = !broadcastForm.active;
    setBroadcastForm((prev) => ({ ...prev, active: nextActive }));
    startTransition(async () => {
      try {
        const res = await fetch("/api/super-admin/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...broadcastForm, active: nextActive }),
        });
        const data = await res.json();
        if (data.ok) {
          showToast(nextActive ? "Global broadcast is now LIVE across terminals!" : "Global broadcast deactivated");
          fetchData();
        } else {
          showToast(`Error: ${data.message}`);
        }
      } catch {
        showToast("Network error updating broadcast status");
      }
    });
  };

  // Handle Onboard Restaurant Submit
  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardError("");

    if (!newResto.name.trim()) {
      setOnboardError("Please enter Restaurant Name");
      return;
    }
    if (!newResto.ownerName.trim()) {
      setOnboardError("Please enter Owner Full Name");
      return;
    }
    if (!newResto.ownerEmail.trim()) {
      setOnboardError("Please enter Owner Email");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(newResto.ownerEmail.trim())) {
      setOnboardError("Please enter a valid email address (e.g. owner@spiceroute.com)");
      return;
    }
    if (!/^\d{4}$/.test(newResto.pin.trim())) {
      setOnboardError("Owner PIN must be exactly 4 digits (e.g. 1234)");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/super-admin/restaurants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newResto),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          showToast(data.message || "Restaurant onboarded!");
          setShowOnboardModal(false);
          setOnboardError("");
          setOnboardSuccessModal({
            id: data.restaurantId || data.restaurant?.id,
            name: data.restaurant?.name || newResto.name,
            ownerName: data.restaurant?.ownerName || newResto.ownerName,
            ownerEmail: data.restaurant?.ownerEmail || newResto.ownerEmail,
            contactPhone: data.restaurant?.contactPhone || newResto.contactPhone,
            pin: data.restaurant?.pin || newResto.pin,
          });
          setNewResto({
            name: "",
            ownerName: "",
            ownerEmail: "",
            contactPhone: "",
            gstin: "",
            pin: "1234",
            plan: "trial",
            tableCount: 6,
            seedSampleMenu: true,
          });
          fetchData();
        } else {
          setOnboardError(data.message || "Onboarding failed. Please verify inputs.");
          showToast(`Onboarding failed: ${data.message || "Error"}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to connect to server";
        setOnboardError(msg);
        showToast("Failed to connect to server");
      }
    });
  };

  // Handle Plan Update
  const handleUpdatePlan = async () => {
    if (!editingRestaurant) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/super-admin/restaurants", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingRestaurant.id,
            subscription_plan: editingRestaurant.subscriptionPlan,
            subscription_status: editingRestaurant.subscriptionStatus,
            gstin: editingRestaurant.gstin,
            theme: editingRestaurant.theme || "amber",
          features: editingRestaurant.features,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          showToast(`Plan updated for ${editingRestaurant.name}`);
          setEditingRestaurant(null);
          fetchData();
        } else {
          showToast(`Update error: ${data.message}`);
        }
      } catch {
        showToast("Failed to save changes");
      }
    });
  };

  // Handle Reset Owner Credentials
  const handleResetOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingOwner) return;

    const pin = resetForm.newPin.trim();
    const pass = resetForm.newPassword.trim();

    if (pin && !/^\d{4}$/.test(pin)) {
      showToast("PIN must be exactly 4 numeric digits (e.g. 1234)");
      return;
    }
    if (pass && pass.length < 8) {
      showToast("Password must be at least 8 characters");
      return;
    }
    if (!pin && !pass && !resetForm.sendRecoveryEmail) {
      showToast("Please specify a new PIN, password, or check magic recovery link");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/super-admin/restaurants/${resettingOwner.id}/reset-owner`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newPin: pin,
            newPassword: pass,
            sendRecoveryEmail: resetForm.sendRecoveryEmail,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          showToast(data.message || "Credentials updated successfully");
          setResettingOwner(null);
          setResetForm({ newPin: "", newPassword: "", sendRecoveryEmail: true });
        } else {
          showToast(`Reset failed: ${data.message}`);
        }
      } catch {
        showToast("Connection error resetting owner");
      }
    });
  };

  const handleOpenStaffModal = async (resto: RestaurantFleetItem) => {
    setManagingStaffResto(resto);
    setLoadingStaffList(true);
    setIsAddingRestoStaff(false);
    try {
      const res = await fetch(`/api/super-admin/restaurants/${resto.id}/staff`);
      const data = await res.json();
      if (data.ok) {
        setRestoStaffList(data.staff || []);
      } else {
        showToast(data.message || "Failed to load restaurant staff");
      }
    } catch {
      showToast("Error connecting to staff service");
    } finally {
      setLoadingStaffList(false);
    }
  };

  const handleCreateRestoStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingStaffResto || !newRestoStaff.name.trim() || !newRestoStaff.pin) return;
    if (!/^\d{4}$/.test(newRestoStaff.pin)) {
      alert("PIN must be exactly 4 digits");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/super-admin/restaurants/${managingStaffResto.id}/staff`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newRestoStaff),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to create staff");
        showToast(`Staff member "${newRestoStaff.name}" created for ${managingStaffResto.name}`);
        setIsAddingRestoStaff(false);
        setNewRestoStaff({ name: "", role: "waiter", pin: "", canEditOrders: false, canDeleteOrders: false });
        handleOpenStaffModal(managingStaffResto);
        fetchData();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to add staff");
      }
    });
  };

  const handleUpdateStaffPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingStaffResto || !editingStaffPin || !newStaffPinValue) return;
    if (!/^\d{4}$/.test(newStaffPinValue)) {
      alert("PIN must be exactly 4 digits");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/super-admin/restaurants/${managingStaffResto.id}/staff`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staffId: editingStaffPin.id,
            newPin: newStaffPinValue,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to update PIN");
        showToast(`PIN updated to ${newStaffPinValue} for ${editingStaffPin.name}`);
        setEditingStaffPin(null);
        setNewStaffPinValue("");
        handleOpenStaffModal(managingStaffResto);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to update PIN");
      }
    });
  };

  const handleToggleStaffActive = async (staffId: string, currentActive: boolean, staffName: string) => {
    if (!managingStaffResto) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/super-admin/restaurants/${managingStaffResto.id}/staff`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staffId,
            isActive: !currentActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to toggle status");
        showToast(`${staffName} marked as ${!currentActive ? "Active" : "Inactive"}`);
        handleOpenStaffModal(managingStaffResto);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to update status");
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#12100E] text-[#EDE8DF] font-sans antialiased selection:bg-[#D96B27] selection:text-white flex flex-col lg:flex-row">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-[#1F1A15] border border-[#D96B27] text-white px-5 py-3.5 rounded-lg shadow-2xl animate-fade-in text-sm font-medium">
          <i className="fa-solid fa-circle-check text-[#D96B27] text-base" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Super Admin Pro Sidebar (Desktop lg:flex) */}
      <aside className="hidden lg:flex w-72 bg-[#14110E] border-r border-[#26201B] flex-col shrink-0 sticky top-0 h-screen overflow-y-auto justify-between p-4 z-30 select-none">
        <div className="space-y-6">
          {/* Brand Header */}
          <div className="flex items-center gap-3 pb-4 border-b border-[#26201B]">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D96B27] to-[#B35218] flex items-center justify-center shadow-lg shadow-[#D96B27]/20 border border-[#FF8A42]/30 shrink-0">
              <i className="fa-solid fa-server text-white text-base" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#D96B27]">Control Deck</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#D96B27]/15 text-[#F38B47] border border-[#D96B27]/30">PRO</span>
              </div>
              <h2 className="text-sm font-bold text-white tracking-tight truncate">
                Super Admin Console
              </h2>
            </div>
          </div>

          {/* Quick Platform Actions Hub */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                setOnboardError("");
                setShowOnboardModal(true);
              }}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#D96B27] to-[#B85418] hover:from-[#E3752F] hover:to-[#C65D1E] text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-[#D96B27]/20 border border-[#FF8A42]/30 transition-all cursor-pointer"
            >
              <i className="fa-solid fa-plus text-xs" />
              <span>+ Onboard Restaurant</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSpotlightOpen(true)}
              className="w-full flex items-center justify-between px-3.5 py-2 bg-[#1B1612] hover:bg-[#241E18] text-[#A89F91] hover:text-white border border-[#2D251F] hover:border-[#D96B27]/50 rounded-xl text-xs font-mono transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-magnifying-glass text-[#D96B27]" />
                <span>Search Outlet...</span>
              </div>
              <kbd className="bg-[#12100E] border border-[#3A3129] px-1.5 py-0.5 rounded text-[9px] text-[#7D7466]">Ctrl K</kbd>
            </button>
          </div>

          {/* Categorized Nav Sections */}
          <nav className="space-y-4 text-xs font-medium">
            {/* Section 1: Tenant Management */}
            <div>
              <div className="px-2 mb-1.5 font-mono text-[10px] font-bold text-[#8C8275] uppercase tracking-wider">
                Tenant Operations
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("fleet")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "fleet"
                      ? "bg-[#D96B27] text-white shadow-lg shadow-[#D96B27]/25 border border-[#FF8A42]/30"
                      : "text-[#A89F91] hover:text-white hover:bg-[#1E1914]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <i className="fa-solid fa-store text-xs" />
                    <span>Tenant Fleet Registry</span>
                  </div>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                      activeTab === "fleet" ? "bg-black/25 text-white" : "bg-[#241E18] text-[#8C8275]"
                    }`}
                  >
                    {restaurants.length}
                  </span>
                </button>
              </div>
            </div>

            {/* Section 2: Global Services */}
            <div>
              <div className="px-2 mb-1.5 font-mono text-[10px] font-bold text-[#8C8275] uppercase tracking-wider">
                Platform Services
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("broadcast")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "broadcast"
                      ? "bg-[#D96B27] text-white shadow-lg shadow-[#D96B27]/25 border border-[#FF8A42]/30"
                      : "text-[#A89F91] hover:text-white hover:bg-[#1E1914]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <i className="fa-solid fa-bullhorn text-xs" />
                    <span>Global Broadcast</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                      broadcastForm.active
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse"
                        : "bg-stone-800 text-stone-400"
                    }`}
                  >
                    {broadcastForm.active ? "LIVE" : "OFF"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("activity")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "activity"
                      ? "bg-[#D96B27] text-white shadow-lg shadow-[#D96B27]/25 border border-[#FF8A42]/30"
                      : "text-[#A89F91] hover:text-white hover:bg-[#1E1914]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <i className="fa-solid fa-timeline text-xs" />
                    <span>Activity &amp; Audit Logs</span>
                  </div>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                      activeTab === "activity" ? "bg-black/25 text-white" : "bg-[#241E18] text-[#8C8275]"
                    }`}
                  >
                    {activities.length}
                  </span>
                </button>
              </div>
            </div>

            {/* Section 3: Quick Outlet Cockpit Switcher */}
            {restaurants.length > 0 && (
              <div>
                <div className="px-2 mb-1.5 font-mono text-[10px] font-bold text-[#8C8275] uppercase tracking-wider flex items-center justify-between">
                  <span>Fast Cockpit Access</span>
                  <span className="text-[9px] text-[#D96B27]">1-Tap</span>
                </div>
                <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                  {restaurants.slice(0, 5).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setCockpitResto(r)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs text-[#A89F91] hover:text-white hover:bg-[#1E1914] transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span>{r.theme === "crimson" ? "🍷" : "🥘"}</span>
                        <span className="truncate font-semibold text-white/90 group-hover:text-[#D96B27]">{r.name}</span>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#241E18] text-[#8C8275] shrink-0">
                        {r.subscriptionPlan}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </nav>
        </div>

        {/* Sidebar Footer: Health Widget & User Profile */}
        <div className="space-y-3 pt-4 border-t border-[#26201B]">
          {/* Realtime Node Status */}
          <div className="p-3 bg-[#181410] border border-[#26201B] rounded-xl space-y-1.5 text-[11px] font-mono">
            <div className="flex items-center justify-between text-[#8C8275]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>DB Realtime Node</span>
              </span>
              <span className="text-emerald-400 font-bold">100% ONLINE</span>
            </div>
            <div className="flex items-center justify-between text-white font-bold text-xs pt-1 border-t border-[#221C17]">
              <span className="text-[#8C8275] text-[10px]">TOTAL GMV:</span>
              <span className="text-[#F38B47]">₹{(stats?.totalGmv || 0).toLocaleString("en-IN")}</span>
            </div>
          </div>

          {/* Quick Exit Links */}
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex-1 flex items-center justify-center gap-1.5 bg-[#1E1914] hover:bg-[#28211B] text-[#D8D0C3] border border-[#302821] py-2 rounded-lg text-xs font-semibold transition-colors"
            >
              <i className="fa-solid fa-arrow-left text-[#8C8275] text-xs" />
              <span>Floor POS</span>
            </Link>

            <button
              type="button"
              onClick={handleSuperAdminSignOut}
              className="p-2 bg-[#1E1914] hover:bg-red-950/60 hover:text-red-300 hover:border-red-800 text-[#8C8275] border border-[#302821] rounded-lg text-xs transition-colors cursor-pointer"
              title="Sign Out of Super Admin"
            >
              <i className="fa-solid fa-arrow-right-from-bracket" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Top Header (lg:hidden) */}
      <header className="lg:hidden border-b border-[#26201B] bg-[#181410]/95 backdrop-blur-md sticky top-0 z-30 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen((prev) => !prev)}
            className="p-2 bg-[#221C17] border border-[#302821] rounded-lg text-white text-sm"
          >
            <i className={`fa-solid ${mobileDrawerOpen ? "fa-xmark" : "fa-bars"}`} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#D96B27] flex items-center justify-center text-white text-xs">
              <i className="fa-solid fa-server" />
            </div>
            <div>
              <div className="text-[10px] font-mono font-bold text-[#D96B27] uppercase">Super Admin</div>
              <div className="text-xs font-bold text-white">Order Desk Console</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSpotlightOpen(true)}
            className="p-2 bg-[#221C17] border border-[#302821] rounded-lg text-[#D96B27] text-xs"
            title="Search (Ctrl+K)"
          >
            <i className="fa-solid fa-magnifying-glass" />
          </button>
          <Link
            href="/"
            className="p-2 bg-[#221C17] border border-[#302821] rounded-lg text-stone-300 text-xs"
            title="Floor POS"
          >
            <i className="fa-solid fa-arrow-left" />
          </Link>
        </div>
      </header>

      {/* Mobile Slide-Out Drawer (lg:hidden) */}
      {mobileDrawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-xs flex"
          onClick={() => setMobileDrawerOpen(false)}
        >
          <div
            className="w-72 bg-[#14110E] h-full border-r border-[#2D251F] p-4 flex flex-col justify-between overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#26201B]">
                <span className="font-bold text-white text-xs">Super Admin Menu</span>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-1 text-stone-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    setOnboardError("");
                    setShowOnboardModal(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-[#D96B27] text-white py-2 rounded-lg text-xs font-bold"
                >
                  <i className="fa-solid fa-plus text-xs" />
                  <span>+ Onboard Restaurant</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    setIsSpotlightOpen(true);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 bg-[#1B1612] text-stone-300 rounded-lg text-xs font-mono border border-stone-800"
                >
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-magnifying-glass text-[#D96B27]" />
                    <span>Search Outlet</span>
                  </div>
                  <span>Ctrl K</span>
                </button>
              </div>

              <nav className="space-y-1 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("fleet");
                    setMobileDrawerOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-bold ${
                    activeTab === "fleet" ? "bg-[#D96B27] text-white" : "text-stone-300 hover:bg-stone-900"
                  }`}
                >
                  <span>Tenant Fleet Registry</span>
                  <span className="text-[10px] font-mono">{restaurants.length}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("broadcast");
                    setMobileDrawerOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-bold ${
                    activeTab === "broadcast" ? "bg-[#D96B27] text-white" : "text-stone-300 hover:bg-stone-900"
                  }`}
                >
                  <span>Global Broadcast</span>
                  <span className="text-[9px] font-mono">{broadcastForm.active ? "LIVE" : "OFF"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("activity");
                    setMobileDrawerOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-bold ${
                    activeTab === "activity" ? "bg-[#D96B27] text-white" : "text-stone-300 hover:bg-stone-900"
                  }`}
                >
                  <span>Activity &amp; Audit Logs</span>
                  <span className="text-[10px] font-mono">{activities.length}</span>
                </button>
              </nav>
            </div>

            <div className="pt-3 border-t border-[#26201B]">
              <button
                type="button"
                onClick={handleSuperAdminSignOut}
                className="w-full py-2 bg-red-950/40 text-red-300 border border-red-800/40 rounded-lg text-xs font-bold"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Main Command Deck Canvas */}
        <main className="max-w-7xl w-full mx-auto px-4 md:px-8 py-6 md:py-8 space-y-8">
        {/* Error Banner */}
        {error && (
          <div className="bg-red-950/40 border border-red-800/60 text-red-200 px-5 py-4 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <i className="fa-solid fa-triangle-exclamation text-red-400 text-lg" />
              <span>{error}</span>
            </div>
            <button
              onClick={fetchData}
              className="px-3 py-1 bg-red-900/60 hover:bg-red-800/80 rounded text-xs font-mono font-bold text-white transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Global Metric Cards (4-Grid) */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Metric 1: Platform GMV */}
          <div className="bg-[#1A1612] border border-[#2A231D] rounded-xl p-5 shadow-sm hover:border-[#3D332B] transition-all">
            <div className="flex items-center justify-between text-xs font-mono text-[#8C8275] mb-2 uppercase tracking-wider">
              <span>Gross Merchant Value (GMV)</span>
              <i className="fa-solid fa-indian-rupee-sign text-[#D96B27]" />
            </div>
            <div className="text-2xl font-mono font-bold text-white tracking-tight">
              {stats ? `₹${stats.totalGmv.toLocaleString("en-IN")}` : "..."}
            </div>
            <div className="mt-2 text-xs font-mono text-emerald-400 flex items-center gap-1.5">
              <i className="fa-solid fa-arrow-trend-up" />
              <span>₹{stats ? stats.todayGmv.toLocaleString("en-IN") : "0"} processed today</span>
            </div>
          </div>

          {/* Metric 2: Onboarded Outlets */}
          <div className="bg-[#1A1612] border border-[#2A231D] rounded-xl p-5 shadow-sm hover:border-[#3D332B] transition-all">
            <div className="flex items-center justify-between text-xs font-mono text-[#8C8275] mb-2 uppercase tracking-wider">
              <span>Active Outlets Fleet</span>
              <i className="fa-solid fa-store text-emerald-400" />
            </div>
            <div className="text-2xl font-mono font-bold text-white tracking-tight flex items-baseline gap-2">
              <span>{stats ? stats.activeRestaurants : "..."}</span>
              <span className="text-sm font-normal text-[#8C8275]">/ {stats ? stats.totalRestaurants : "0"} Total</span>
            </div>
            <div className="mt-2 text-xs font-mono text-[#A89F91]">
              {stats?.expiredRestaurants ? (
                <span className="text-red-400 font-semibold">{stats.expiredRestaurants} Outlets Frozen/Expired</span>
              ) : (
                <span className="text-emerald-400 font-semibold">100% Outlets Healthy & Active</span>
              )}
            </div>
          </div>

          {/* Metric 3: Total Platform Orders */}
          <div className="bg-[#1A1612] border border-[#2A231D] rounded-xl p-5 shadow-sm hover:border-[#3D332B] transition-all">
            <div className="flex items-center justify-between text-xs font-mono text-[#8C8275] mb-2 uppercase tracking-wider">
              <span>Total Orders Handled</span>
              <i className="fa-solid fa-receipt text-blue-400" />
            </div>
            <div className="text-2xl font-mono font-bold text-white tracking-tight">
              {stats ? stats.totalOrders.toLocaleString("en-IN") : "..."}
            </div>
            <div className="mt-2 text-xs font-mono text-blue-400 flex items-center gap-1.5">
              <i className="fa-solid fa-bolt" />
              <span>{stats ? stats.todayOrders : "0"} Dispatched today</span>
            </div>
          </div>

          {/* Metric 4: Subscription Tier Distribution */}
          <div className="bg-[#1A1612] border border-[#2A231D] rounded-xl p-5 shadow-sm hover:border-[#3D332B] transition-all">
            <div className="flex items-center justify-between text-xs font-mono text-[#8C8275] mb-2 uppercase tracking-wider">
              <span>Plan Distribution</span>
              <i className="fa-solid fa-layer-group text-purple-400" />
            </div>
            <div className="flex items-center gap-3 text-xs font-mono mt-1">
              <div className="flex-1 bg-[#221C17] border border-[#302821] p-2 rounded-lg text-center">
                <div className="text-[10px] text-[#8C8275] uppercase">Trial</div>
                <div className="text-base font-bold text-amber-400">{stats ? stats.planBreakdown.trial : 0}</div>
              </div>
              <div className="flex-1 bg-[#221C17] border border-[#302821] p-2 rounded-lg text-center">
                <div className="text-[10px] text-[#8C8275] uppercase">Basic</div>
                <div className="text-base font-bold text-blue-400">{stats ? stats.planBreakdown.basic : 0}</div>
              </div>
              <div className="flex-1 bg-[#221C17] border border-[#302821] p-2 rounded-lg text-center">
                <div className="text-[10px] text-[#8C8275] uppercase">Pro</div>
                <div className="text-base font-bold text-emerald-400">{stats ? stats.planBreakdown.pro : 0}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Platform Control Tabs: Fleet Registry, Global Broadcast, Activity Audit Log */}
        <section className="flex flex-wrap items-center gap-2 border-b border-[#26201B] pb-3">
          <button
            onClick={() => setActiveTab("fleet")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "fleet"
                ? "bg-[#D96B27] text-white shadow-lg shadow-[#D96B27]/25 border border-[#FF8A42]/30"
                : "bg-[#181410] text-[#A89F91] hover:text-white border border-[#26201A]"
            }`}
          >
            <i className="fa-solid fa-store" />
            <span>Tenant Fleet Registry</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                activeTab === "fleet" ? "bg-black/25 text-white" : "bg-[#241E18] text-[#8C8275]"
              }`}
            >
              {restaurants.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("broadcast")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "broadcast"
                ? "bg-[#D96B27] text-white shadow-lg shadow-[#D96B27]/25 border border-[#FF8A42]/30"
                : "bg-[#181410] text-[#A89F91] hover:text-white border border-[#26201A]"
            }`}
          >
            <i className="fa-solid fa-bullhorn" />
            <span>Global Broadcast</span>
            <span
              className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                broadcastForm.active
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse"
                  : "bg-stone-800 text-stone-400"
              }`}
            >
              {broadcastForm.active ? "LIVE" : "OFF"}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("activity")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "activity"
                ? "bg-[#D96B27] text-white shadow-lg shadow-[#D96B27]/25 border border-[#FF8A42]/30"
                : "bg-[#181410] text-[#A89F91] hover:text-white border border-[#26201A]"
            }`}
          >
            <i className="fa-solid fa-timeline" />
            <span>Activity &amp; Audit Log</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                activeTab === "activity" ? "bg-black/25 text-white" : "bg-[#241E18] text-[#8C8275]"
              }`}
            >
              {activities.length}
            </span>
          </button>
        </section>

        {/* TAB 1: FLEET REGISTRY */}
        {activeTab === "fleet" && (
          <>
            {/* Toolbar: Search, Filters & Action Button */}
            <section className="bg-[#181410] border border-[#26201A] rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                {/* Search Input */}
                <div className="relative flex-1 md:w-80">
                  <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8C8275] text-xs" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search restaurant, owner email, GSTIN..."
                    className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg pl-9 pr-3.5 py-2 text-xs text-white placeholder-[#6E6457] focus:outline-none transition-colors"
                  />
                </div>

                {/* Plan Filter */}
                <select
                  value={planFilter}
                  onChange={(e) => setPlanFilter(e.target.value)}
                  className="bg-[#12100E] border border-[#2D251F] text-xs text-[#D8D0C3] rounded-lg px-3 py-2 focus:border-[#D96B27] focus:outline-none"
                >
                  <option value="all">All Plans</option>
                  <option value="trial">Trial Plan</option>
                  <option value="basic">Basic Plan</option>
                  <option value="pro">Pro Plan</option>
                </select>

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-[#12100E] border border-[#2D251F] text-xs text-[#D8D0C3] rounded-lg px-3 py-2 focus:border-[#D96B27] focus:outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="expired">Expired / Frozen</option>
                  <option value="archived">Archived / Cancelled</option>
                </select>

            <button
              onClick={fetchData}
              title="Refresh Fleet Data"
              className="p-2 bg-[#221C17] hover:bg-[#2A231C] text-[#A89F91] border border-[#302821] rounded-lg text-xs transition-colors"
            >
              <i className={`fa-solid fa-arrows-rotate ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Primary Action: Onboard Restaurant */}
          <button
            onClick={() => {
              setOnboardError("");
              setShowOnboardModal(true);
            }}
            className="w-full md:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-[#D96B27] to-[#B85418] hover:from-[#E3752F] hover:to-[#C65D1E] text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow-lg shadow-[#D96B27]/20 border border-[#FF8A42]/30 transition-all cursor-pointer"
          >
            <i className="fa-solid fa-plus text-xs" />
            <span>Onboard New Restaurant</span>
          </button>
        </section>

        {/* Restaurant Fleet Table */}
        <section className="bg-[#181410] border border-[#26201A] rounded-xl overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-[#26201A] flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <i className="fa-solid fa-building-user text-[#D96B27]" />
              <span>Tenant Fleet Registry</span>
              <span className="text-xs font-mono text-[#8C8275] lowercase">({filteredRestaurants.length} outlets matching)</span>
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#14110E] text-[#8C8275] uppercase font-mono border-b border-[#26201A]">
                <tr>
                  <th className="px-4 py-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={filteredRestaurants.length > 0 && selectedRestoIds.length === filteredRestaurants.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRestoIds(filteredRestaurants.map((r) => r.id));
                        } else {
                          setSelectedRestoIds([]);
                        }
                      }}
                      className="w-4 h-4 accent-[#D96B27] rounded cursor-pointer"
                      title="Select all matching outlets"
                    />
                  </th>
                  <th className="px-5 py-3.5">Restaurant &amp; Feature Matrix</th>
                  <th className="px-5 py-3.5">Owner &amp; Contact</th>
                  <th className="px-5 py-3.5">Plan &amp; Theme</th>
                  <th className="px-5 py-3.5">Live Metrics</th>
                  <th className="px-5 py-3.5">Subscription</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#241F1A]">
                {loading && restaurants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-[#8C8275] font-mono">
                      <i className="fa-solid fa-circle-notch animate-spin text-lg text-[#D96B27] mb-2 block" />
                      Loading platform tenant records...
                    </td>
                  </tr>
                ) : filteredRestaurants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-[#8C8275] font-mono">
                      No restaurants match your filter. Click &quot;+ Onboard New Restaurant&quot; to add one.
                    </td>
                  </tr>
                ) : (
                  filteredRestaurants.map((r) => {
                    const isArchived = Boolean(r.isArchived || r.subscriptionStatus === "cancelled");
                    const isActive = r.subscriptionStatus === "active" && !isArchived;
                    const isSelected = selectedRestoIds.includes(r.id);
                    return (
                      <tr
                        key={r.id}
                        className={`transition-colors ${
                          isSelected
                            ? "bg-[#D96B27]/10"
                            : isArchived
                            ? "bg-amber-950/10 hover:bg-amber-950/20"
                            : "hover:bg-[#1E1914]/60"
                        }`}
                      >
                        {/* Checkbox Column */}
                        <td className="px-4 py-4 w-10">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              if (e.target.checked) {
                                setSelectedRestoIds((prev) => [...prev, r.id]);
                              } else {
                                setSelectedRestoIds((prev) => prev.filter((id) => id !== r.id));
                              }
                            }}
                            className="w-4 h-4 accent-[#D96B27] rounded cursor-pointer"
                          />
                        </td>

                        {/* Restaurant Name, ID & Interactive 1-Click Feature Matrix */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">{r.name}</span>
                            {isArchived && (
                              <span className="bg-amber-900/40 text-amber-300 text-[10px] font-mono px-2 py-0.5 rounded border border-amber-800/60 font-bold uppercase">
                                ARCHIVED
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-[#7D7466] flex items-center gap-2 mt-0.5">
                            <span>ID: {r.id.slice(0, 8)}...</span>
                            {r.gstin && (
                              <span className="bg-[#221C17] px-1.5 py-0.2 rounded text-[10px] text-[#A89F91] border border-[#2F2720]">
                                GST: {r.gstin}
                              </span>
                            )}
                          </div>

                          {/* 1-Click Direct Feature Matrix Pills */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {[
                              {
                                key: "loyaltyOffers" as const,
                                label: "Offers",
                                icon: "🎁",
                                active: Boolean(r.features?.loyaltyOffers ?? true),
                              },
                              {
                                key: "tablePayUpi" as const,
                                label: "UPI",
                                icon: "💳",
                                active: Boolean(r.features?.tablePayUpi),
                              },
                              {
                                key: "callWaiter" as const,
                                label: "Waiter",
                                icon: "🛎️",
                                active: Boolean(r.features?.callWaiter),
                              },
                              {
                                key: "mobileNavStyle" as const,
                                label: "BottomBar",
                                icon: "⚡",
                                active: (r.features?.mobileNavStyle ?? "bottom_bar") === "bottom_bar",
                              },
                              {
                                key: "feedbackReview" as const,
                                label: "Review",
                                icon: "⭐",
                                active: Boolean(r.features?.feedbackReview),
                              },
                              {
                                key: "prepTimeTracker" as const,
                                label: "Timer",
                                icon: "⏳",
                                active: Boolean(r.features?.prepTimeTracker),
                              },
                              {
                                key: "autoMobileCards" as const,
                                label: "Cards",
                                icon: "🖼️",
                                active: Boolean(r.features?.autoMobileCards ?? true),
                              },
                            ].map((pill) => (
                              <button
                                key={pill.key}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDirectToggleFeature(r, pill.key);
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                                  pill.active
                                    ? "bg-emerald-950/40 text-emerald-300 border-emerald-700/60 hover:bg-emerald-900/60 shadow-xs"
                                    : "bg-[#1E1914] text-stone-500 border-stone-800/80 hover:border-stone-700 hover:text-stone-300"
                                }`}
                                title={`Click to toggle ${pill.label} (${pill.active ? "Currently ON" : "Currently OFF"})`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${pill.active ? "bg-emerald-400" : "bg-stone-600"}`} />
                                <span>{pill.icon}</span>
                                <span>{pill.label}</span>
                              </button>
                            ))}
                          </div>
                        </td>

                        {/* Owner Details */}
                        <td className="px-6 py-4">
                          <div className="font-semibold text-[#EDE8DF]">{r.ownerName}</div>
                          <div className="text-[11px] text-[#8C8275] font-mono">{r.ownerEmail}</div>
                        </td>

                        {/* Plan & Theme */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1 items-start">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${
                                r.subscriptionPlan === "pro"
                                  ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/60"
                                  : r.subscriptionPlan === "basic"
                                  ? "bg-blue-950/40 text-blue-300 border-blue-800/60"
                                  : "bg-amber-950/40 text-amber-300 border-amber-800/60"
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              {r.subscriptionPlan}
                            </span>

                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#1F1914] border border-[#332A22]">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{
                                  backgroundColor: r.theme === "crimson" ? "#741A2F" : "#FFBE0B",
                                  border: r.theme === "crimson" ? "1px solid #FFC6A8" : "1px solid #2A2312",
                                }}
                              />
                              <span className="text-[#A89F91]">
                                {r.theme === "crimson" ? "Crimson" : "Amber Gold"}
                              </span>
                            </span>
                          </div>
                        </td>

                        {/* Metrics */}
                        <td className="px-6 py-4 font-mono text-[11px]">
                          <div className="text-white font-bold">₹{r.stats.gmv.toLocaleString("en-IN")}</div>
                          <div className="text-[#8C8275] flex items-center gap-2 mt-0.5">
                            <span>{r.stats.tableCount} Tables</span>
                            <span>•</span>
                            <span>{r.stats.totalOrders} Orders</span>
                          </div>
                        </td>

                        {/* Subscription Status Toggle */}
                        <td className="px-6 py-4">
                          {isArchived ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-amber-950/40 text-amber-300 border border-amber-800/60">
                              <i className="fa-solid fa-box-archive text-[10px]" />
                              <span>ARCHIVED</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => handleToggleStatus(r)}
                              disabled={isPending}
                              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-mono font-bold transition-all border cursor-pointer ${
                                isActive
                                  ? "bg-emerald-950/30 text-emerald-400 border-emerald-800/60 hover:bg-red-950/30 hover:text-red-400 hover:border-red-800/60"
                                  : "bg-red-950/30 text-red-400 border-red-800/60 hover:bg-emerald-950/30 hover:text-emerald-400 hover:border-emerald-800/60"
                              }`}
                              title={isActive ? "Click to Freeze/Suspend" : "Click to Activate"}
                            >
                              <span className={`w-2 h-2 rounded-full ${isActive ? "bg-emerald-400" : "bg-red-400"}`} />
                              <span>{isActive ? "ACTIVE" : "FROZEN"}</span>
                            </button>
                          )}
                        </td>

                        {/* Actions: Share Menu, WhatsApp, Staff, Impersonate, Plan, Reset, Archive/Restore, Delete */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Pro Feature Cockpit Trigger */}
                            <button
                              onClick={() => setCockpitResto(r)}
                              className="px-2.5 py-1 bg-[#D96B27]/20 hover:bg-[#D96B27] text-[#F38B47] hover:text-white border border-[#D96B27]/50 rounded text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                              title="Open Executive Feature Cockpit & Live Screen Mirror"
                            >
                              <i className="fa-solid fa-sliders text-[10px]" />
                              <span>Cockpit</span>
                            </button>

                            {/* WhatsApp Direct Owner Link */}
                            <a
                              href={(() => {
                                const origin = typeof window !== "undefined" ? window.location.origin : "";
                                const loginUrl = `${origin}/login?resto=${r.id}&role=owner`;
                                const cleanPhone = (r.contactPhone || "").replace(/\D/g, "");
                                const msg = `👋 *OrderDesk Login - ${r.name}*\n\n🔗 *Dashboard Link*: ${loginUrl}\n👤 *Owner*: ${r.ownerName}\n📧 *Email*: ${r.ownerEmail}\n\nOpen this link on your mobile or tablet to access your restaurant desk!`;
                                return cleanPhone
                                  ? `https://api.whatsapp.com/send?phone=91${cleanPhone.length === 10 ? cleanPhone : cleanPhone}&text=${encodeURIComponent(msg)}`
                                  : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
                              })()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 rounded text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                              title="Send Login Link to Owner via WhatsApp"
                            >
                              <i className="fa-brands fa-whatsapp text-emerald-400 text-xs" />
                              <span>WhatsApp</span>
                            </a>

                            {/* Share Customer Menu */}
                            <button
                              onClick={() => setShareMenuResto(r)}
                              className="px-2.5 py-1 bg-[#1A2C21] hover:bg-[#223B2C] text-emerald-300 border border-emerald-700/50 rounded text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                              title="Share or View Customer Digital Menu"
                            >
                              <i className="fa-solid fa-share-nodes text-[10px] text-emerald-400" />
                              <span>Share Menu</span>
                            </button>

                            {/* View & Manage Staff Roster */}
                            <button
                              onClick={() => handleOpenStaffModal(r)}
                              className="px-2.5 py-1 bg-[#221C17] hover:bg-[#2C241E] text-[#D8D0C3] border border-[#302821] rounded text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                              title="Inspect staff, roles, PINs, and add staff members"
                            >
                              <i className="fa-solid fa-users text-[#D96B27] text-[10px]" />
                              <span>Staff ({r.stats.staffCount})</span>
                            </button>

                            {/* Impersonate Ghost Mode */}
                            <button
                              onClick={() => handleImpersonate(r)}
                              disabled={isPending}
                              className="px-2.5 py-1 bg-[#D96B27]/15 hover:bg-[#D96B27]/30 text-[#F38B47] border border-[#D96B27]/40 rounded text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                              title="Ghost Mode: View live terminal as restaurant owner"
                            >
                              <i className="fa-solid fa-ghost text-[10px]" />
                              <span>Impersonate</span>
                            </button>

                            {/* Edit Plan */}
                            <button
                              onClick={() => setEditingRestaurant(r)}
                              className="px-2 py-1 bg-[#221C17] hover:bg-[#2C241E] text-[#D8D0C3] border border-[#302821] rounded text-[11px] transition-colors cursor-pointer"
                              title="Edit Subscription Plan"
                            >
                              <i className="fa-solid fa-pen-to-square text-[#8C8275]" />
                            </button>

                            {/* Reset Credentials */}
                            <button
                              onClick={() => {
                                setResettingOwner(r);
                                setResetForm({ newPin: "", newPassword: "", sendRecoveryEmail: true });
                              }}
                              className="px-2 py-1 bg-[#221C17] hover:bg-[#2C241E] text-[#D8D0C3] border border-[#302821] rounded text-[11px] transition-colors cursor-pointer"
                              title="Reset Owner PIN / Password"
                            >
                              <i className="fa-solid fa-key text-[#D96B27]" />
                            </button>

                            {/* Archive or Restore Button */}
                            {isArchived ? (
                              <button
                                onClick={() => handleArchiveToggle(r)}
                                disabled={isPending}
                                className="px-2.5 py-1 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 rounded text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                                title="Restore to Active Fleet"
                              >
                                <i className="fa-solid fa-rotate-left text-[10px]" />
                                <span>Restore</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleArchiveToggle(r)}
                                disabled={isPending}
                                className="px-2 py-1 bg-[#221C17] hover:bg-[#2C241E] text-amber-400 border border-amber-900/40 rounded text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                                title="Archive Outlet (GST Audit Protected)"
                              >
                                <i className="fa-solid fa-box-archive text-[10px]" />
                                <span>Archive</span>
                              </button>
                            )}

                            {/* Delete Button */}
                            <button
                              onClick={() => setDeletingRestaurant(r)}
                              disabled={isPending}
                              className="px-2 py-1 bg-red-950/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 rounded text-[11px] transition-colors cursor-pointer"
                              title={r.stats.totalOrders > 0 ? "Protected by GST audit compliance" : "Delete test outlet"}
                            >
                              <i className="fa-solid fa-trash-can" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          </section>

          {/* Floating Bulk Fleet Actions Dock */}
          {selectedRestoIds.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#1A1612]/95 backdrop-blur-md border border-[#D96B27] rounded-2xl px-5 py-3 shadow-[0_10px_35px_rgba(0,0,0,0.8)] flex flex-wrap items-center gap-3 animate-fade-in text-xs">
              <div className="flex items-center gap-2 pr-3 border-r border-[#302821]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#D96B27] animate-ping" />
                <span className="font-mono font-bold text-white">
                  {selectedRestoIds.length} Outlets Selected
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleBulkApplyFeatures(DHABA_PRESET, "Highway Dhaba Pack")}
                  className="px-3 py-1.5 bg-[#251F19] hover:bg-[#322A22] text-[#EDE8DF] border border-[#3E342B] rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>🥘</span>
                  <span>Apply Dhaba Pack</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleBulkApplyFeatures(FINE_DINE_PRESET, "Fine Dining Pack")}
                  className="px-3 py-1.5 bg-[#251F19] hover:bg-[#322A22] text-[#EDE8DF] border border-[#3E342B] rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>🍷</span>
                  <span>Apply Fine Dine Pack</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleBulkApplyFeatures(CAFE_PRESET, "Quick Cafe Pack")}
                  className="px-3 py-1.5 bg-[#251F19] hover:bg-[#322A22] text-[#EDE8DF] border border-[#3E342B] rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>☕</span>
                  <span>Apply Cafe Pack</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleBulkApplyFeatures(ENTERPRISE_ALL_PRESET, "All Features ON")}
                  className="px-3 py-1.5 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>⚡</span>
                  <span>Turn ALL ON</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRestoIds([])}
                  className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors cursor-pointer ml-1"
                  title="Deselect all"
                >
                  <i className="fa-solid fa-xmark text-sm" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 2: GLOBAL BROADCAST */}
      {activeTab === "broadcast" && (
        <div className="space-y-6">
          {/* Live Terminal Preview Box */}
          <div className="bg-[#181410] border border-[#26201A] rounded-xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#26201B] pb-3">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-desktop text-[#D96B27]" />
                <h3 className="font-bold text-white text-sm uppercase tracking-wider">Live Terminal Notice Preview</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${broadcastForm.active ? "bg-emerald-400 animate-ping" : "bg-stone-500"}`} />
                <span className="text-xs font-mono font-bold text-[#A89F91]">
                  {broadcastForm.active ? "CURRENTLY ACTIVE ON TERMINALS" : "DRAFT / INACTIVE"}
                </span>
              </div>
            </div>

            {/* Preview Display */}
            <div
              className={`px-5 py-3.5 rounded-lg flex items-center justify-between text-xs font-medium border shadow-inner transition-all ${
                broadcastForm.type === "alert"
                  ? "bg-red-950/80 text-red-200 border-red-800"
                  : broadcastForm.type === "warning"
                  ? "bg-amber-950/80 text-amber-200 border-amber-800"
                  : broadcastForm.type === "maintenance"
                  ? "bg-purple-950/80 text-purple-200 border-purple-800"
                  : "bg-blue-950/80 text-blue-200 border-blue-800"
              }`}
            >
              <div className="flex items-center gap-3">
                <i
                  className={`fa-solid text-sm ${
                    broadcastForm.type === "alert"
                      ? "fa-triangle-exclamation text-red-400"
                      : broadcastForm.type === "warning"
                      ? "fa-circle-exclamation text-amber-400"
                      : broadcastForm.type === "maintenance"
                      ? "fa-wrench text-purple-400"
                      : "fa-bullhorn text-blue-400"
                  }`}
                />
                <div>
                  <strong className="font-mono uppercase tracking-wider mr-2 font-bold">
                    [{broadcastForm.title || "Platform Announcement"}]
                  </strong>
                  <span>{broadcastForm.message || "Your notification message will appear here across all POS floor terminals."}</span>
                </div>
              </div>
              {broadcastForm.dismissible && (
                <span className="text-xs opacity-60 ml-4 font-mono">[✕ Dismissible]</span>
              )}
            </div>
          </div>

          {/* Broadcast Form Editor */}
          <div className="bg-[#181410] border border-[#26201A] rounded-xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-[#26201B] pb-3">
              <div>
                <h3 className="font-bold text-white text-sm">Platform Notice Editor</h3>
                <p className="text-xs text-[#8C8275]">Publish system announcements or maintenance alerts to all restaurant dashboards</p>
              </div>
              <button
                type="button"
                onClick={handleToggleBroadcastActive}
                disabled={isPending}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer border ${
                  broadcastForm.active
                    ? "bg-emerald-950/40 text-emerald-300 border-emerald-800 hover:bg-red-950/40 hover:text-red-300 hover:border-red-800"
                    : "bg-[#221C17] text-[#8C8275] border-[#302821] hover:text-emerald-300 hover:border-emerald-800"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${broadcastForm.active ? "bg-emerald-400" : "bg-stone-500"}`} />
                <span>{broadcastForm.active ? "STATUS: BROADCASTING (CLICK TO PAUSE)" : "STATUS: PAUSED (CLICK TO ACTIVATE)"}</span>
              </button>
            </div>

            <form onSubmit={handleSaveBroadcast} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#A89F91] font-mono uppercase text-[10px] mb-1">
                    Banner Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Scheduled Night Maintenance"
                    value={broadcastForm.title}
                    onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
                    className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[#A89F91] font-mono uppercase text-[10px] mb-1">
                    Alert Level / Theme
                  </label>
                  <select
                    value={broadcastForm.type}
                    onChange={(e) =>
                      setBroadcastForm({
                        ...broadcastForm,
                        type: e.target.value as "info" | "warning" | "alert" | "maintenance",
                      })
                    }
                    className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-white focus:outline-none"
                  >
                    <option value="info">Information (Blue) - Updates &amp; Announcements</option>
                    <option value="warning">Warning (Amber) - Performance / Heavy Load</option>
                    <option value="alert">Critical Alert (Red) - Downtime / Critical Notice</option>
                    <option value="maintenance">Maintenance (Purple) - Upgrade Windows</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#A89F91] font-mono uppercase text-[10px] mb-1">
                  Announcement Message Body *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Enter the message displayed on floor pos terminals..."
                  value={broadcastForm.message}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                  className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between bg-[#12100E] border border-[#2D251F] rounded-lg p-3">
                <div>
                  <div className="font-semibold text-white">Allow Staff Dismissal</div>
                  <div className="text-[11px] text-[#8C8275]">
                    Staff can click ✕ to dismiss the notice during their current session
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={broadcastForm.dismissible}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, dismissible: e.target.checked })}
                  className="w-4 h-4 accent-[#D96B27] rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#26201B]">
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 bg-gradient-to-r from-[#D96B27] to-[#B85418] hover:from-[#E3752F] text-white rounded-lg text-xs font-bold shadow-lg shadow-[#D96B27]/25 cursor-pointer flex items-center gap-2"
                >
                  <i className="fa-solid fa-floppy-disk" />
                  <span>Save &amp; Update Broadcast</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: ACTIVITY & AUDIT LOG */}
      {activeTab === "activity" && (
        <section className="bg-[#181410] border border-[#26201A] rounded-xl overflow-hidden shadow-xl space-y-4 p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#26201B] pb-4">
            <div>
              <h3 className="font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2">
                <i className="fa-solid fa-shield-halved text-[#D96B27]" />
                <span>Platform Operations &amp; Audit Trail</span>
                <span className="text-xs font-mono text-[#8C8275] lowercase">({filteredActivities.length} events logged)</span>
              </h3>
              <p className="text-xs text-[#8C8275] mt-0.5">
                Immutable operational log tracking tenant onboardings, status freezes, plan adjustments, credential resets, and ghost impersonations.
              </p>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-[#8C8275] text-xs" />
                <input
                  type="text"
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  placeholder="Search logs..."
                  className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>

              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
                className="bg-[#12100E] border border-[#2D251F] text-xs text-[#D8D0C3] rounded-lg px-3 py-1.5 focus:border-[#D96B27] focus:outline-none"
              >
                <option value="all">All Event Types</option>
                <option value="ONBOARD">Onboard Outlet</option>
                <option value="PLAN_CHANGE">Plan Change</option>
                <option value="STATUS_CHANGE">Status Change</option>
                <option value="ARCHIVE">Archived</option>
                <option value="RESTORE">Restored</option>
                <option value="DELETE">Deleted</option>
                <option value="RESET_CREDENTIALS">Reset PIN/Password</option>
                <option value="IMPERSONATE">Ghost Impersonation</option>
                <option value="BROADCAST_UPDATE">Global Broadcast</option>
              </select>

              <button
                onClick={fetchData}
                className="p-1.5 bg-[#221C17] hover:bg-[#2A231C] text-[#A89F91] border border-[#302821] rounded-lg text-xs"
                title="Refresh Audit Logs"
              >
                <i className="fa-solid fa-arrows-rotate" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#14110E] text-[#8C8275] uppercase font-mono border-b border-[#26201A]">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Target Outlet</th>
                  <th className="px-4 py-3">Super Admin Actor</th>
                  <th className="px-4 py-3">Operational Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#241F1A]">
                {filteredActivities.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-[#8C8275] font-mono">
                      No activity events found matching your filter.
                    </td>
                  </tr>
                ) : (
                  filteredActivities.map((act) => {
                    const actionBadge =
                      act.action === "ONBOARD"
                        ? "bg-emerald-950/40 text-emerald-300 border-emerald-800"
                        : act.action === "ARCHIVE"
                        ? "bg-amber-950/40 text-amber-300 border-amber-800"
                        : act.action === "RESTORE"
                        ? "bg-teal-950/40 text-teal-300 border-teal-800"
                        : act.action === "DELETE"
                        ? "bg-red-950/40 text-red-300 border-red-800"
                        : act.action === "IMPERSONATE"
                        ? "bg-orange-950/40 text-orange-300 border-orange-800"
                        : act.action === "BROADCAST_UPDATE"
                        ? "bg-purple-950/40 text-purple-300 border-purple-800"
                        : act.action === "RESET_CREDENTIALS"
                        ? "bg-yellow-950/40 text-yellow-300 border-yellow-800"
                        : "bg-blue-950/40 text-blue-300 border-blue-800";

                    return (
                      <tr key={act.id} className="hover:bg-[#1E1914]/60 transition-colors">
                        <td className="px-4 py-3 font-mono text-[11px] text-[#8C8275] whitespace-nowrap">
                          {new Date(act.createdAt).toLocaleString("en-IN", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${actionBadge}`}>
                            {act.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">
                          {act.targetName || "Platform"}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[#A89F91]">
                          {act.actorEmail}
                        </td>
                        <td className="px-4 py-3 text-[#EDE8DF]">
                          {act.details}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
    </div>

      {/* MODAL 1: Onboard New Restaurant */}
      {showOnboardModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181410] border border-[#2E2721] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#26201B] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#D96B27]/20 border border-[#D96B27]/40 flex items-center justify-center text-[#D96B27]">
                  <i className="fa-solid fa-store text-base" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Onboard New Restaurant</h3>
                  <p className="text-xs text-[#8C8275]">Creates database tenant, tables, and owner account</p>
                </div>
              </div>
              <button
                onClick={() => setShowOnboardModal(false)}
                className="text-[#8C8275] hover:text-white transition-colors cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-lg" />
              </button>
            </div>

            <form onSubmit={handleOnboardSubmit} className="space-y-4 text-xs">
              {onboardError && (
                <div className="p-3.5 bg-red-950/80 border border-red-800/80 text-red-200 text-xs rounded-xl flex items-center gap-2.5 font-mono animate-fade-in">
                  <i className="fa-solid fa-triangle-exclamation text-red-400 text-sm flex-shrink-0" />
                  <span>{onboardError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#A89F91] font-mono uppercase text-[10px] mb-1">Restaurant Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Spice Route Bistro"
                    value={newResto.name}
                    onChange={(e) => setNewResto({ ...newResto, name: e.target.value })}
                    className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[#A89F91] font-mono uppercase text-[10px] mb-1">GSTIN (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    value={newResto.gstin}
                    onChange={(e) => setNewResto({ ...newResto, gstin: e.target.value })}
                    className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#A89F91] font-mono uppercase text-[10px] mb-1">Owner Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={newResto.ownerName}
                    onChange={(e) => setNewResto({ ...newResto, ownerName: e.target.value })}
                    className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[#A89F91] font-mono uppercase text-[10px] mb-1">Owner Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="owner@spiceroute.com"
                    value={newResto.ownerEmail}
                    onChange={(e) => setNewResto({ ...newResto, ownerEmail: e.target.value })}
                    className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[#A89F91] font-mono uppercase text-[10px] mb-1 flex items-center gap-1">
                    <span>Owner WhatsApp / Phone</span>
                    <span className="text-emerald-400 font-bold">📲</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={newResto.contactPhone}
                    onChange={(e) => setNewResto({ ...newResto, contactPhone: e.target.value })}
                    className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[#A89F91] font-mono uppercase text-[10px] mb-1">Initial Plan</label>
                  <select
                    value={newResto.plan}
                    onChange={(e) => setNewResto({ ...newResto, plan: e.target.value })}
                    className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-white focus:outline-none"
                  >
                    <option value="trial">Trial (14 Days)</option>
                    <option value="basic">Basic (Monthly)</option>
                    <option value="pro">Pro (Yearly)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#A89F91] font-mono uppercase text-[10px] mb-1">Initial Tables</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={newResto.tableCount}
                    onChange={(e) => setNewResto({ ...newResto, tableCount: Number(e.target.value) })}
                    className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[#A89F91] font-mono uppercase text-[10px] mb-1">Owner PIN (4 Digits)</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={newResto.pin}
                    onChange={(e) => setNewResto({ ...newResto, pin: e.target.value })}
                    className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-white font-mono text-center tracking-widest focus:outline-none"
                  />
                </div>
              </div>

              <div className="bg-[#12100E] border border-[#2D251F] rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">Seed Starter Menu Pack</div>
                  <div className="text-[11px] text-[#8C8275]">Pre-populates Starters, Main Course, Breads &amp; Chai</div>
                </div>
                <input
                  type="checkbox"
                  checked={newResto.seedSampleMenu}
                  onChange={(e) => setNewResto({ ...newResto, seedSampleMenu: e.target.checked })}
                  className="w-4 h-4 accent-[#D96B27] rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#26201B]">
                <button
                  type="button"
                  onClick={() => setShowOnboardModal(false)}
                  className="px-4 py-2 bg-[#221C17] hover:bg-[#2A231C] text-[#A89F91] rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 bg-gradient-to-r from-[#D96B27] to-[#B85418] hover:from-[#E3752F] text-white rounded-lg text-xs font-bold shadow-lg shadow-[#D96B27]/20 cursor-pointer"
                >
                  {isPending ? "Creating Tenant..." : "Complete Onboarding"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1.5: Onboard Success & WhatsApp Dispatch */}
      {onboardSuccessModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#181410] border border-[#2E2721] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scale-up">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400 text-2xl shadow-lg">
                🎉
              </div>
              <h3 className="font-bold text-white text-lg">Restaurant Onboarded Successfully!</h3>
              <p className="text-xs text-[#8C8275]">
                {onboardSuccessModal.name} has been provisioned. Send credentials directly to the owner.
              </p>
            </div>

            {/* Credentials Card */}
            <div className="bg-[#12100E] border border-[#2D251F] rounded-xl p-4 space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center text-[#A89F91] border-b border-[#241E18] pb-2">
                <span>Restaurant Name:</span>
                <span className="text-white font-bold">{onboardSuccessModal.name}</span>
              </div>
              <div className="flex justify-between items-center text-[#A89F91] border-b border-[#241E18] pb-2">
                <span>Owner:</span>
                <span className="text-white font-bold">{onboardSuccessModal.ownerName}</span>
              </div>
              <div className="flex justify-between items-center text-[#A89F91] border-b border-[#241E18] pb-2">
                <span>Owner Email:</span>
                <span className="text-white font-bold">{onboardSuccessModal.ownerEmail}</span>
              </div>
              {onboardSuccessModal.contactPhone && (
                <div className="flex justify-between items-center text-[#A89F91] border-b border-[#241E18] pb-2">
                  <span>WhatsApp / Phone:</span>
                  <span className="text-emerald-400 font-bold">{onboardSuccessModal.contactPhone}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-[#A89F91]">
                <span>Owner PIN / Password:</span>
                <span className="text-amber-400 font-bold text-sm tracking-widest bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/60">
                  {onboardSuccessModal.pin}
                </span>
              </div>
            </div>

            {/* Direct Login Link Preview */}
            <div className="bg-[#12100E] border border-[#2D251F] rounded-xl p-3 space-y-1.5">
              <div className="text-[10px] uppercase font-mono text-[#8C8275] flex items-center justify-between">
                <span>Direct Magic Login Link (No Passwords Needed):</span>
                {copiedLink && <span className="text-emerald-400 font-bold">✓ Copied!</span>}
              </div>
              <div className="text-xs text-[#D8D0C3] font-mono break-all bg-black/40 p-2 rounded border border-[#241E18]">
                {typeof window !== "undefined"
                  ? `${window.location.origin}/login?resto=${onboardSuccessModal.id}&role=owner&pin=${onboardSuccessModal.pin}`
                  : `/login?resto=${onboardSuccessModal.id}&role=owner&pin=${onboardSuccessModal.pin}`}
              </div>
            </div>

            {/* WhatsApp & Copy Action Buttons */}
            <div className="space-y-2">
              <a
                href={(() => {
                  const origin = typeof window !== "undefined" ? window.location.origin : "";
                  const loginUrl = `${origin}/login?resto=${onboardSuccessModal.id}&role=owner&pin=${onboardSuccessModal.pin}`;
                  const cleanPhone = (onboardSuccessModal.contactPhone || "").replace(/\D/g, "");
                  const msg = `🎉 *Welcome to OrderDesk, ${onboardSuccessModal.name}!*\n\nYour restaurant management dashboard is ready:\n🔗 *Direct Login Link*: ${loginUrl}\n\n👤 *Owner*: ${onboardSuccessModal.ownerName}\n📧 *Owner Email*: ${onboardSuccessModal.ownerEmail}\n🔑 *Secret PIN / Password*: ${onboardSuccessModal.pin}\n\nTap the link above to instantly access your restaurant desk, live tables, kitchen display, and digital menu.`;
                  return cleanPhone
                    ? `https://api.whatsapp.com/send?phone=91${cleanPhone.length === 10 ? cleanPhone : cleanPhone}&text=${encodeURIComponent(msg)}`
                    : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
                })()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/40 cursor-pointer"
              >
                <i className="fa-brands fa-whatsapp text-base" />
                <span>Send Credentials on WhatsApp</span>
              </a>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const origin = typeof window !== "undefined" ? window.location.origin : "";
                    const loginUrl = `${origin}/login?resto=${onboardSuccessModal.id}&role=owner&pin=${onboardSuccessModal.pin}`;
                    const text = `Restaurant: ${onboardSuccessModal.name}\nOwner: ${onboardSuccessModal.ownerName}\nEmail: ${onboardSuccessModal.ownerEmail}\nOwner PIN: ${onboardSuccessModal.pin}\nLogin URL: ${loginUrl}`;
                    navigator.clipboard.writeText(text);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2500);
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-[#221C17] hover:bg-[#2C241E] text-[#D8D0C3] border border-[#302821] rounded-xl text-xs font-semibold cursor-pointer"
                >
                  <i className="fa-solid fa-copy text-[11px]" />
                  <span>{copiedLink ? "Copied!" : "Copy Link & PIN"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOnboardSuccessModal(null)}
                  className="py-2 px-3 bg-[#D96B27] hover:bg-[#E3752F] text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Plan & Subscription */}
      {editingRestaurant && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181410] border border-[#2E2721] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#26201B] pb-4">
              <div>
                <h3 className="font-bold text-white text-base">Edit Subscription</h3>
                <p className="text-xs text-[#8C8275]">{editingRestaurant.name}</p>
              </div>
              <button
                onClick={() => setEditingRestaurant(null)}
                className="text-[#8C8275] hover:text-white cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-lg" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[#A89F91] font-mono uppercase text-[10px] mb-1">Subscription Plan</label>
                <select
                  value={editingRestaurant.subscriptionPlan}
                  onChange={(e) =>
                    setEditingRestaurant({
                      ...editingRestaurant,
                      subscriptionPlan: e.target.value as "trial" | "basic" | "pro",
                    })
                  }
                  className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-white focus:outline-none"
                >
                  <option value="trial">Trial (14 Days)</option>
                  <option value="basic">Basic Tier</option>
                  <option value="pro">Pro Enterprise Tier</option>
                </select>
              </div>

              <div>
                <label className="block text-[#A89F91] font-mono uppercase text-[10px] mb-1">Account Status</label>
                <select
                  value={editingRestaurant.subscriptionStatus}
                  onChange={(e) =>
                    setEditingRestaurant({
                      ...editingRestaurant,
                      subscriptionStatus: e.target.value as "active" | "expired" | "cancelled",
                    })
                  }
                  className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-white focus:outline-none"
                >
                  <option value="active">Active (Access Granted)</option>
                  <option value="expired">Expired / Frozen (Access Blocked)</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {/* Theme Palette Selection */}
              <div>
                <label className="block text-[#A89F91] font-mono uppercase text-[10px] mb-1.5">
                  Brand Theme & Visual Palette
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingRestaurant({
                        ...editingRestaurant,
                        theme: "amber",
                      })
                    }
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      (editingRestaurant.theme || "amber") === "amber"
                        ? "border-[#FFBE0B] bg-[#FFBE0B]/10 shadow-[0_0_15px_rgba(255,190,11,0.2)]"
                        : "border-[#2D251F] bg-[#12100E] hover:border-stone-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-5 h-5 rounded-full bg-[#FFBE0B] border border-white/20 shadow-sm" />
                      <div className="w-5 h-5 rounded-full bg-[#2A2312] border border-[#FFBE0B]/40" />
                    </div>
                    <div className="font-bold text-white text-xs">Amber Gold (Default)</div>
                    <div className="text-[10px] text-[#A89F91] mt-0.5">#FFBE0B · Cafe / Bistro / Modern</div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEditingRestaurant({
                        ...editingRestaurant,
                        theme: "crimson",
                      })
                    }
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      editingRestaurant.theme === "crimson"
                        ? "border-[#FFC6A8] bg-[#741A2F]/30 shadow-[0_0_15px_rgba(116,26,47,0.3)]"
                        : "border-[#2D251F] bg-[#12100E] hover:border-stone-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-5 h-5 rounded-full bg-[#741A2F] border border-white/20 shadow-sm" />
                      <div className="w-5 h-5 rounded-full bg-[#FFC6A8] border border-[#741A2F]/40" />
                    </div>
                    <div className="font-bold text-white text-xs">Velvet Crimson</div>
                    <div className="text-[10px] text-[#A89F91] mt-0.5">#741A2F & #FFC6A8 · Luxury Fine Dine</div>
                  </button>
                </div>
              </div>

              {/* Feature Permissions & Entitlement Switchboard */}
              <div className="pt-2 border-t border-[#26201B]">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[#A89F91] font-mono uppercase text-[10px]">
                    Feature Entitlements & Add-on Switchboard
                  </label>
                  {/* Preset Buttons */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingRestaurant({
                          ...editingRestaurant,
                          features: {
                            callWaiter: false,
                            prepTimeTracker: false,
                            customRequests: false,
                            tablePayUpi: false,
                            dishNotes: true,
                            smartUpsell: false,
                            feedbackReview: false,
                          },
                        })
                      }
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#1E1914] text-[#8C8275] hover:text-white border border-[#2D251F]"
                    >
                      Starter
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingRestaurant({
                          ...editingRestaurant,
                          features: {
                            callWaiter: true,
                            prepTimeTracker: true,
                            customRequests: true,
                            tablePayUpi: false,
                            dishNotes: true,
                            smartUpsell: true,
                            feedbackReview: true,
                          },
                        })
                      }
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950/40 text-blue-300 hover:text-white border border-blue-800/60"
                    >
                      Pro
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingRestaurant({
                          ...editingRestaurant,
                          features: {
                            callWaiter: true,
                            prepTimeTracker: true,
                            customRequests: true,
                            tablePayUpi: true,
                            dishNotes: true,
                            smartUpsell: true,
                            feedbackReview: true,
                          },
                        })
                      }
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/40 text-emerald-300 hover:text-white border border-emerald-800/60"
                    >
                      Enterprise All
                    </button>
                  </div>
                </div>

                <div className="space-y-2 bg-[#12100E] p-3 rounded-xl border border-[#2D251F]">
                  {[
                    { key: "callWaiter", label: "Call Waiter Buzzer", desc: "Diner can sound staff counter chime", icon: "🛎️" },
                    { key: "prepTimeTracker", label: "Chef Prep Countdown", desc: "1-Tap prep time setter & live diner countdown", icon: "⏳" },
                    { key: "customRequests", label: "Specific Need Pills", desc: "Cutlery, Dips, Baby Chair & Custom Notes", icon: "🥄" },
                    { key: "tablePayUpi", label: "Instant UPI Table Pay", desc: "Diner pays directly via UPI QR upon bill request", icon: "💳" },
                    { key: "dishNotes", label: "Cooking Instructions", desc: "Special notes per dish (e.g. less spicy)", icon: "✏️" },
                    { key: "smartUpsell", label: "Smart Cart Upsell", desc: "Companion food & drink pairing suggestions", icon: "💡" },
                    { key: "feedbackReview", label: "Post-Meal Rating", desc: "5-star rating & Google review booster", icon: "⭐" },
                  ].map((feat) => {
                    const currentFeats = editingRestaurant.features || {
                      callWaiter: true,
                      prepTimeTracker: true,
                      customRequests: true,
                      tablePayUpi: true,
                      dishNotes: true,
                      smartUpsell: true,
                      feedbackReview: true,
                    };
                    const isEnabled = currentFeats[feat.key as keyof typeof currentFeats] ?? true;

                    return (
                      <div
                        key={feat.key}
                        onClick={() =>
                          setEditingRestaurant({
                            ...editingRestaurant,
                            features: {
                              ...currentFeats,
                              [feat.key]: !isEnabled,
                            },
                          })
                        }
                        className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all ${
                          isEnabled
                            ? "bg-[#1E1A16] border-[#D96B27]/40 text-white"
                            : "bg-[#14110E] border-transparent text-[#7D7466] hover:border-[#2D251F]"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">{feat.icon}</span>
                          <div>
                            <div className="font-bold text-xs leading-snug">{feat.label}</div>
                            <div className="text-[10px] text-[#8C8275]">{feat.desc}</div>
                          </div>
                        </div>

                        <div
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                            isEnabled ? "bg-[#D96B27] justify-end" : "bg-stone-800 justify-start"
                          }`}
                        >
                          <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Mobile & Tablet UI/UX Controls Section */}
                <div className="pt-3 border-t border-[#26201B] space-y-2.5">
                  <div>
                    <span className="font-mono text-[10px] text-[#D96B27] uppercase font-bold tracking-wider block">
                      📱 Mobile &amp; Tablet UI/UX Architecture
                    </span>
                    <span className="text-[11px] text-[#A89F91]">
                      Configure 1-thumb touch navigation, native bottom sheet drawers &amp; touch card views
                    </span>
                  </div>

                  {/* 1. Mobile Navigation Style */}
                  <div className="p-3 bg-[#12100E] border border-[#2D251F] rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>📱</span>
                          <span>Mobile Navigation Style</span>
                        </div>
                        <div className="text-[10px] text-[#8C8275]">
                          Choose how station managers navigate on phones (&lt; 768px)
                        </div>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                        {editingRestaurant.features?.mobileNavStyle === "sidebar" ? "Drawer Menu" : "Bottom Tab Bar (Default)"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingRestaurant({
                            ...editingRestaurant,
                            features: {
                              ...(editingRestaurant.features || {
                                callWaiter: true,
                                prepTimeTracker: true,
                                customRequests: true,
                                tablePayUpi: true,
                                dishNotes: true,
                                smartUpsell: true,
                                feedbackReview: true,
                              }),
                              mobileNavStyle: "bottom_bar",
                            },
                          })
                        }
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                          editingRestaurant.features?.mobileNavStyle !== "sidebar"
                            ? "bg-[#D96B27]/15 border-[#D96B27] text-white shadow-xs"
                            : "bg-[#181410] border-[#2D251F] text-[#8C8275] hover:text-white"
                        }`}
                      >
                        <div className="font-bold flex items-center justify-between">
                          <span>⚡ Bottom Tab Bar</span>
                          {editingRestaurant.features?.mobileNavStyle !== "sidebar" && <span className="text-[10px] text-[#D96B27]">✓ Active</span>}
                        </div>
                        <div className="text-[10px] text-[#8C8275] mt-0.5">
                          1-Thumb touch docked at bottom (Zomato/Toast POS style)
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setEditingRestaurant({
                            ...editingRestaurant,
                            features: {
                              ...(editingRestaurant.features || {
                                callWaiter: true,
                                prepTimeTracker: true,
                                customRequests: true,
                                tablePayUpi: true,
                                dishNotes: true,
                                smartUpsell: true,
                                feedbackReview: true,
                              }),
                              mobileNavStyle: "sidebar",
                            },
                          })
                        }
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                          editingRestaurant.features?.mobileNavStyle === "sidebar"
                            ? "bg-[#D96B27]/15 border-[#D96B27] text-white shadow-xs"
                            : "bg-[#181410] border-[#2D251F] text-[#8C8275] hover:text-white"
                        }`}
                      >
                        <div className="font-bold flex items-center justify-between">
                          <span>☰ Slide Drawer</span>
                          {editingRestaurant.features?.mobileNavStyle === "sidebar" && <span className="text-[10px] text-[#D96B27]">✓ Active</span>}
                        </div>
                        <div className="text-[10px] text-[#8C8275] mt-0.5">
                          Top bar with hamburger slide-out sidebar sheet
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* 2. Mobile Bottom Sheet Drawers Switch */}
                  <div
                    onClick={() => {
                      const cur = editingRestaurant.features || {
                        callWaiter: true,
                        prepTimeTracker: true,
                        customRequests: true,
                        tablePayUpi: true,
                        dishNotes: true,
                        smartUpsell: true,
                        feedbackReview: true,
                      };
                      setEditingRestaurant({
                        ...editingRestaurant,
                        features: {
                          ...cur,
                          mobileSheetModals: cur.mobileSheetModals === false ? true : false,
                        },
                      });
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      editingRestaurant.features?.mobileSheetModals !== false
                        ? "bg-[#1E1A16] border-[#D96B27]/40 text-white"
                        : "bg-[#14110E] border-transparent text-[#7D7466] hover:border-[#2D251F]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">📲</span>
                      <div>
                        <div className="font-bold text-xs leading-snug">Native Bottom Sheet Modals</div>
                        <div className="text-[10px] text-[#8C8275]">
                          Convert modals to bottom sheet drawers with sticky action buttons (never hidden by keyboard)
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                        editingRestaurant.features?.mobileSheetModals !== false ? "bg-[#D96B27] justify-end" : "bg-stone-800 justify-start"
                      }`}
                    >
                      <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                    </div>
                  </div>

                  {/* 3. Auto Mobile Cards Switch */}
                  <div
                    onClick={() => {
                      const cur = editingRestaurant.features || {
                        callWaiter: true,
                        prepTimeTracker: true,
                        customRequests: true,
                        tablePayUpi: true,
                        dishNotes: true,
                        smartUpsell: true,
                        feedbackReview: true,
                      };
                      setEditingRestaurant({
                        ...editingRestaurant,
                        features: {
                          ...cur,
                          autoMobileCards: cur.autoMobileCards === false ? true : false,
                        },
                      });
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      editingRestaurant.features?.autoMobileCards !== false
                        ? "bg-[#1E1A16] border-[#D96B27]/40 text-white"
                        : "bg-[#14110E] border-transparent text-[#7D7466] hover:border-[#2D251F]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">🖼️</span>
                      <div>
                        <div className="font-bold text-xs leading-snug">Auto Mobile Touch Cards</div>
                        <div className="text-[10px] text-[#8C8275]">
                          Auto-switch wide 8-column menu table to 1-tap touch cards on phone screens
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                        editingRestaurant.features?.autoMobileCards !== false ? "bg-[#D96B27] justify-end" : "bg-stone-800 justify-start"
                      }`}
                    >
                      <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#26201B]">
                <button
                  type="button"
                  onClick={() => setEditingRestaurant(null)}
                  className="px-4 py-2 bg-[#221C17] text-[#A89F91] rounded-lg text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpdatePlan}
                  disabled={isPending}
                  className="px-5 py-2 bg-[#D96B27] hover:bg-[#E3752F] text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  {isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Reset Owner Credentials */}
      {resettingOwner && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181410] border border-[#2E2721] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#26201B] pb-4">
              <div>
                <h3 className="font-bold text-white text-base">Reset Owner Credentials</h3>
                <p className="text-xs text-[#8C8275]">{resettingOwner.name} ({resettingOwner.ownerEmail})</p>
              </div>
              <button
                onClick={() => setResettingOwner(null)}
                className="text-[#8C8275] hover:text-white cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-lg" />
              </button>
            </div>

            <form onSubmit={handleResetOwnerSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#A89F91] font-mono uppercase text-[10px] mb-1">Set New 4-Digit Terminal PIN</label>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="e.g. 1234"
                  value={resetForm.newPin}
                  onChange={(e) => setResetForm({ ...resetForm, newPin: e.target.value })}
                  className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-white font-mono tracking-widest text-center focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#A89F91] font-mono uppercase text-[10px] mb-1">Set Direct Password (Optional)</label>
                <input
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={resetForm.newPassword}
                  onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })}
                  className="w-full bg-[#12100E] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-white focus:outline-none"
                />
              </div>

              <div className="bg-[#12100E] border border-[#2D251F] rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">Send Magic Recovery Link</div>
                  <div className="text-[11px] text-[#8C8275]">Triggers email reset link via Supabase Auth</div>
                </div>
                <input
                  type="checkbox"
                  checked={resetForm.sendRecoveryEmail}
                  onChange={(e) => setResetForm({ ...resetForm, sendRecoveryEmail: e.target.checked })}
                  className="w-4 h-4 accent-[#D96B27] rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#26201B]">
                <button
                  type="button"
                  onClick={() => setResettingOwner(null)}
                  className="px-4 py-2 bg-[#221C17] text-[#A89F91] rounded-lg text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 bg-[#D96B27] hover:bg-[#E3752F] text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  {isPending ? "Updating..." : "Execute Reset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Delete / Archive Confirmation Guard */}
      {deletingRestaurant && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181410] border border-[#2E2721] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#26201B] pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    deletingRestaurant.stats.totalOrders > 0
                      ? "bg-amber-950/60 text-amber-400 border border-amber-800"
                      : "bg-red-950/60 text-red-400 border border-red-800"
                  }`}
                >
                  <i
                    className={`fa-solid ${
                      deletingRestaurant.stats.totalOrders > 0 ? "fa-shield-halved" : "fa-trash-can"
                    }`}
                  />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    {deletingRestaurant.stats.totalOrders > 0
                      ? "GST & Financial Audit Guard"
                      : "Permanent Outlet Purge"}
                  </h3>
                  <p className="text-xs text-[#8C8275]">{deletingRestaurant.name}</p>
                </div>
              </div>
              <button
                onClick={() => setDeletingRestaurant(null)}
                className="text-[#8C8275] hover:text-white cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-lg" />
              </button>
            </div>

            {deletingRestaurant.stats.totalOrders > 0 ? (
              <div className="space-y-4 text-xs">
                <div className="bg-amber-950/30 border border-amber-800/60 text-amber-200 p-4 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[11px] text-amber-300">
                    <i className="fa-solid fa-triangle-exclamation" />
                    <span>Permanent Deletion Blocked</span>
                  </div>
                  <p className="leading-relaxed">
                    Outlet <strong>&quot;{deletingRestaurant.name}&quot;</strong> has{" "}
                    <strong className="text-white underline">{deletingRestaurant.stats.totalOrders} registered orders</strong> and
                    financial transactions. Under Indian GST accounting regulations, historical tax books cannot be deleted.
                  </p>
                  <p className="text-[11px] text-amber-300/80">
                    Please use <strong>Archive</strong> instead. This freezes all outlet operations and logins while safely preserving audit trails.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeletingRestaurant(null)}
                    className="px-4 py-2 bg-[#221C17] hover:bg-[#2A231C] text-[#A89F91] rounded-lg font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const target = deletingRestaurant;
                      setDeletingRestaurant(null);
                      handleArchiveToggle(target);
                    }}
                    disabled={isPending}
                    className="px-5 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-stone-950 font-bold rounded-lg shadow-lg shadow-amber-900/30 cursor-pointer flex items-center gap-2"
                  >
                    <i className="fa-solid fa-box-archive" />
                    <span>Archive Outlet Safely</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="bg-red-950/30 border border-red-800/60 text-red-200 p-4 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[11px] text-red-300">
                    <i className="fa-solid fa-skull-crossbones" />
                    <span>Test Outlet Cleanup (0 Orders)</span>
                  </div>
                  <p className="leading-relaxed">
                    Are you sure you want to permanently delete <strong>&quot;{deletingRestaurant.name}&quot;</strong>?
                  </p>
                  <p className="text-[11px] text-red-300/80">
                    This outlet has <strong>0 orders</strong>. All associated tables, PINs, and menu records will be permanently removed.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeletingRestaurant(null)}
                    className="px-4 py-2 bg-[#221C17] hover:bg-[#2A231C] text-[#A89F91] rounded-lg font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmDelete(true)}
                    disabled={isPending}
                    className="px-5 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold rounded-lg shadow-lg shadow-red-900/30 cursor-pointer flex items-center gap-2"
                  >
                    <i className="fa-solid fa-trash-can" />
                    <span>Permanent Delete</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* MODAL 5: Restaurant Staff Roster & Admin Creation */}
      {managingStaffResto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181410] border border-[#2E2721] rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 animate-scale-up max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#26201B] pb-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#D96B27]/20 border border-[#D96B27]/40 flex items-center justify-center text-[#D96B27]">
                  <i className="fa-solid fa-users text-base" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-[#D96B27] uppercase font-bold tracking-wider">
                      SUPER ADMIN STAFF CONTROL
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#251E18] text-[#A89F91]">
                      {restoStaffList.length} Staff
                    </span>
                  </div>
                  <h3 className="font-bold text-white text-base">
                    Staff &amp; Terminal PINs: {managingStaffResto.name}
                  </h3>
                  <p className="text-xs text-[#8C8275]">
                    Owner: {managingStaffResto.ownerEmail} • ID: {managingStaffResto.id.slice(0, 8)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAddingRestoStaff(!isAddingRestoStaff)}
                  className="flex items-center gap-1.5 bg-[#D96B27] hover:bg-[#E3752F] text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  <i className="fa-solid fa-plus text-[10px]" />
                  <span>{isAddingRestoStaff ? "Cancel" : "Add Staff for this Outlet"}</span>
                </button>
                <button
                  onClick={() => setManagingStaffResto(null)}
                  className="text-[#8C8275] hover:text-white p-1 text-lg cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Inline Add Staff Form */}
            {isAddingRestoStaff && (
              <form onSubmit={handleCreateRestoStaff} className="bg-[#12100E] border border-[#2D251F] rounded-xl p-4 space-y-4 flex-shrink-0">
                <div className="flex items-center justify-between border-b border-[#241E18] pb-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    + Create New Staff Member for {managingStaffResto.name}
                  </span>
                  <span className="text-[10px] text-[#8C8275]">Super Admin Direct Creation</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-[#A89F91] uppercase mb-1">Staff Name *</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Anand Verma"
                      value={newRestoStaff.name}
                      onChange={(e) => setNewRestoStaff({ ...newRestoStaff, name: e.target.value })}
                      className="w-full bg-[#181410] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-xs text-white placeholder-[#6E6457] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-[#A89F91] uppercase mb-1">Role *</label>
                    <select
                      value={newRestoStaff.role}
                      onChange={(e) => {
                        const r = e.target.value;
                        const isMgr = r === "manager" || r === "admin";
                        const isCap = r === "captain";
                        setNewRestoStaff({
                          ...newRestoStaff,
                          role: r,
                          canEditOrders: isMgr || isCap,
                          canDeleteOrders: isMgr,
                        });
                      }}
                      className="w-full bg-[#181410] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                    >
                      <option value="waiter">Waiter / Staff</option>
                      <option value="captain">Captain (Lead)</option>
                      <option value="kitchen">Kitchen Staff</option>
                      <option value="cashier">Cashier</option>
                      <option value="manager">Manager</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-[#A89F91] uppercase mb-1">4-Digit PIN *</label>
                    <input
                      required
                      type="password"
                      maxLength={4}
                      placeholder="1234"
                      value={newRestoStaff.pin}
                      onChange={(e) => setNewRestoStaff({ ...newRestoStaff, pin: e.target.value.replace(/\D/g, "") })}
                      className="w-full bg-[#181410] border border-[#2D251F] focus:border-[#D96B27] rounded-lg px-3 py-2 text-xs text-white font-mono tracking-widest text-center focus:outline-none"
                    />
                  </div>
                </div>

                {/* Permissions Checkboxes */}
                <div className="flex flex-wrap items-center gap-6 pt-1 text-xs">
                  <label className="flex items-center gap-2 text-[#D8D0C3] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newRestoStaff.canEditOrders}
                      onChange={(e) => setNewRestoStaff({ ...newRestoStaff, canEditOrders: e.target.checked })}
                      className="accent-[#D96B27] rounded cursor-pointer"
                    />
                    <span>Allow Edit Orders</span>
                  </label>

                  <label className="flex items-center gap-2 text-[#D8D0C3] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newRestoStaff.canDeleteOrders}
                      onChange={(e) => setNewRestoStaff({ ...newRestoStaff, canDeleteOrders: e.target.checked })}
                      className="accent-[#D96B27] rounded cursor-pointer"
                    />
                    <span>Allow Void / Delete Orders</span>
                  </label>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingRestoStaff(false)}
                      className="px-3 py-1.5 bg-[#221C17] hover:bg-[#2A231C] text-[#A89F91] rounded-lg text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="px-4 py-1.5 bg-[#D96B27] hover:bg-[#E3752F] text-white rounded-lg text-xs font-bold"
                    >
                      {isPending ? "Creating..." : "Save Staff Member"}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Staff Table */}
            <div className="flex-1 overflow-y-auto min-h-0 border border-[#26201A] rounded-xl bg-[#12100E]">
              {loadingStaffList ? (
                <div className="p-12 text-center text-[#8C8275] font-mono text-xs">
                  <i className="fa-solid fa-circle-notch animate-spin text-lg text-[#D96B27] mb-2 block" />
                  Loading restaurant staff roster...
                </div>
              ) : restoStaffList.length === 0 ? (
                <div className="p-12 text-center text-[#8C8275] text-xs font-mono">
                  No staff accounts registered for this outlet. Click &quot;Add Staff for this Outlet&quot; above to create one.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#181410] text-[#8C8275] uppercase font-mono border-b border-[#26201A] sticky top-0">
                    <tr>
                      <th className="px-5 py-3">Staff Name</th>
                      <th className="px-5 py-3">Role</th>
                      <th className="px-5 py-3">Terminal PIN</th>
                      <th className="px-5 py-3">Permissions</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#241F1A]">
                    {restoStaffList.map((s) => {
                      const isRevealed = Boolean(showPinsMap[s.id]);
                      const pinDisplay = s.permissions?.assignedPin || "1234";

                      return (
                        <tr key={s.id} className="hover:bg-[#1E1914]/60 transition-colors">
                          <td className="px-5 py-3">
                            <div className="font-bold text-white text-xs">{s.name}</div>
                            <div className="text-[10px] text-[#6E6457] font-mono">ID: {s.id.slice(0, 8)}</div>
                          </td>

                          <td className="px-5 py-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#251E18] text-[#D8D0C3] border border-[#3A3026]">
                              {s.role.toUpperCase()}
                            </span>
                          </td>

                          <td className="px-5 py-3 font-mono">
                            <div className="flex items-center gap-2">
                              <span className="bg-[#1B1612] px-2 py-1 rounded text-xs text-amber-400 font-bold border border-amber-900/30">
                                {isRevealed ? pinDisplay : "••••"}
                              </span>
                              <button
                                onClick={() => setShowPinsMap((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                                className="text-[#8C8275] hover:text-white text-[11px] cursor-pointer"
                                title={isRevealed ? "Hide PIN" : "Show Plain PIN"}
                              >
                                <i className={`fa-solid ${isRevealed ? "fa-eye-slash" : "fa-eye"}`} />
                              </button>
                            </div>
                          </td>

                          <td className="px-5 py-3">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                                  s.role === "owner" || s.permissions?.canEditOrders
                                    ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/60"
                                    : "bg-stone-900 text-stone-500"
                                }`}
                              >
                                Edit: {s.role === "owner" || s.permissions?.canEditOrders ? "YES" : "NO"}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                                  s.role === "owner" || s.permissions?.canDeleteOrders
                                    ? "bg-amber-950/40 text-amber-300 border border-amber-800/60"
                                    : "bg-stone-900 text-stone-500"
                                }`}
                              >
                                Void: {s.role === "owner" || s.permissions?.canDeleteOrders ? "YES" : "NO"}
                              </span>
                            </div>
                          </td>

                          <td className="px-5 py-3">
                            <button
                              onClick={() => handleToggleStaffActive(s.id, s.is_active, s.name)}
                              disabled={s.role === "owner" || isPending}
                              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                s.is_active
                                  ? "bg-emerald-950/30 text-emerald-400 border-emerald-800/60 hover:bg-red-950/30 hover:text-red-400"
                                  : "bg-red-950/30 text-red-400 border-red-800/60 hover:bg-emerald-950/30 hover:text-emerald-400"
                              } ${s.role === "owner" ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? "bg-emerald-400" : "bg-red-400"}`} />
                              <span>{s.is_active ? "ACTIVE" : "INACTIVE"}</span>
                            </button>
                          </td>

                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* WhatsApp Invite for Staff */}
                              <a
                                href={(() => {
                                  const origin = typeof window !== "undefined" ? window.location.origin : "";
                                  const staffLoginUrl = `${origin}/login?resto=${managingStaffResto.id}&role=${s.role}&staff=${s.id}`;
                                  const msg = `👋 *OrderDesk Shift Access*\n\nRestaurant: *${managingStaffResto.name}*\nStaff Name: *${s.name}*\nRole: *${s.role.toUpperCase()}*\nPIN: *${pinDisplay}*\n\n🔗 *Shift Login Link*: ${staffLoginUrl}`;
                                  return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
                                })()}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-1 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 rounded text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                                title="Send Shift Login via WhatsApp"
                              >
                                <i className="fa-brands fa-whatsapp text-emerald-400 text-[10px]" />
                                <span>Share</span>
                              </a>

                              <button
                                onClick={() => {
                                  setEditingStaffPin({ id: s.id, name: s.name });
                                  setNewStaffPinValue("");
                                }}
                                className="px-2 py-1 bg-[#221C17] hover:bg-[#2C241E] text-[#D8D0C3] border border-[#302821] rounded text-[11px] font-semibold transition-colors cursor-pointer"
                                title="Reset 4-Digit PIN"
                              >
                                Reset PIN
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Quick PIN Reset Sub-Modal */}
            {editingStaffPin && (
              <form onSubmit={handleUpdateStaffPin} className="bg-[#14110E] border border-[#D96B27]/40 rounded-xl p-4 flex items-center justify-between gap-4 flex-shrink-0">
                <div>
                  <span className="text-xs font-bold text-white block">
                    Change 4-Digit PIN for &quot;{editingStaffPin.name}&quot;
                  </span>
                  <span className="text-[10px] text-[#8C8275]">
                    Enter new numeric code for POS terminal PIN login
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    required
                    type="password"
                    maxLength={4}
                    placeholder="New PIN (4 digits)"
                    value={newStaffPinValue}
                    onChange={(e) => setNewStaffPinValue(e.target.value.replace(/\D/g, ""))}
                    className="bg-[#1B1612] border border-[#3A3026] text-white px-3 py-1.5 rounded-lg text-xs font-mono tracking-widest text-center w-28 focus:outline-none focus:border-[#D96B27]"
                  />
                  <button
                    type="button"
                    onClick={() => setEditingStaffPin(null)}
                    className="px-3 py-1.5 bg-[#221C17] hover:bg-[#2A231C] text-[#A89F91] rounded-lg text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || newStaffPinValue.length !== 4}
                    className="px-4 py-1.5 bg-[#D96B27] hover:bg-[#E3752F] text-white rounded-lg text-xs font-bold shadow cursor-pointer disabled:opacity-50"
                  >
                    Update PIN
                  </button>
                </div>
              </form>
            )}

            {/* Footer */}
            <div className="pt-3 border-t border-[#26201B] flex justify-end flex-shrink-0">
              <button
                type="button"
                onClick={() => setManagingStaffResto(null)}
                className="px-4 py-2 bg-[#221C17] hover:bg-[#2A231C] text-[#A89F91] rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close Roster
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Menu Share & QR Modal */}
      {shareMenuResto && (
        <ShareMenuModal
          isOpen={Boolean(shareMenuResto)}
          onClose={() => setShareMenuResto(null)}
          restaurantName={shareMenuResto.name}
          tables={shareMenuResto.tables || []}
        />
      )}

      {/* MODAL: Spotlight Command Palette (Ctrl+K) */}
      {isSpotlightOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-16 p-4"
          onClick={() => setIsSpotlightOpen(false)}
        >
          <div
            className="bg-[#181410] border border-[#302821] rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#26201B] bg-[#14110E]">
              <i className="fa-solid fa-magnifying-glass text-[#D96B27] text-base" />
              <input
                type="text"
                autoFocus
                value={spotlightQuery}
                onChange={(e) => setSpotlightQuery(e.target.value)}
                placeholder="Type to search restaurant, dhaba, owner name, phone, or ID..."
                className="w-full bg-transparent text-sm text-white placeholder-stone-500 focus:outline-none font-sans"
              />
              <kbd className="bg-[#221C17] border border-[#302821] px-2 py-0.5 rounded text-[10px] font-mono text-stone-400">
                ESC
              </kbd>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 divide-y divide-[#241E18]">
              {spotlightMatches.length === 0 ? (
                <div className="p-8 text-center text-stone-500 text-xs font-mono">
                  No restaurants or dhabas match &quot;{spotlightQuery}&quot;
                </div>
              ) : (
                spotlightMatches.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded-xl hover:bg-[#221C17] flex items-center justify-between gap-4 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#26201A] border border-[#3A3026] flex items-center justify-center text-lg shrink-0">
                        {r.theme === "crimson" ? "🍷" : "🥘"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm truncate">{r.name}</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-[#181410] border border-stone-800 text-stone-400">
                            {r.subscriptionPlan}
                          </span>
                          {r.subscriptionStatus === "active" ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          )}
                        </div>
                        <div className="text-[11px] text-stone-400 font-mono truncate">
                          Owner: {r.ownerName} • {r.ownerEmail} {r.contactPhone ? `• 📲 ${r.contactPhone}` : ""}
                        </div>
                      </div>
                    </div>

                    {/* Action shortcuts */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setIsSpotlightOpen(false);
                          setCockpitResto(r);
                        }}
                        className="px-3 py-1.5 bg-[#D96B27]/20 hover:bg-[#D96B27] text-[#F38B47] hover:text-white border border-[#D96B27]/40 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <i className="fa-solid fa-sliders text-[11px]" />
                        <span>Cockpit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsSpotlightOpen(false);
                          handleImpersonate(r);
                        }}
                        className="px-2.5 py-1.5 bg-[#1F1A15] hover:bg-[#2A231C] text-stone-300 border border-[#302821] rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                        title="Launch POS as Owner"
                      >
                        <i className="fa-solid fa-ghost text-[10px]" />
                        <span>Launch POS</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 bg-[#12100E] border-t border-[#26201B] flex justify-between items-center text-[11px] text-stone-500 font-mono">
              <span>Navigation: Click or tap any outlet to open Cockpit</span>
              <span>{filteredRestaurants.length} Total Outlets</span>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER: Executive Feature Cockpit with Live Smartphone Simulator */}
      {cockpitResto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end"
          onClick={() => setCockpitResto(null)}
        >
          <div
            className="w-full max-w-4xl bg-[#16120E] border-l border-[#2D251F] h-full flex flex-col shadow-2xl overflow-hidden animate-slide-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cockpit Header */}
            <div className="p-5 border-b border-[#26201B] bg-[#14110E] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D96B27] to-[#B35218] flex items-center justify-center text-2xl shadow-lg shadow-[#D96B27]/20 border border-[#FF8A42]/30">
                  {cockpitResto.theme === "crimson" ? "🍷" : "🥘"}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white tracking-tight">{cockpitResto.name}</h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      {cockpitResto.subscriptionPlan} Plan
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        cockpitResto.subscriptionStatus === "active"
                          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                          : "bg-red-500/15 text-red-300 border border-red-500/30"
                      }`}
                    >
                      {cockpitResto.subscriptionStatus}
                    </span>
                  </div>
                  <div className="text-xs text-[#8C8275] font-mono mt-0.5">
                    Owner: {cockpitResto.ownerName} ({cockpitResto.ownerEmail})
                    {cockpitResto.contactPhone ? ` • 📲 ${cockpitResto.contactPhone}` : ""}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleImpersonate(cockpitResto)}
                  className="px-3 py-1.5 bg-[#D96B27]/20 hover:bg-[#D96B27] text-[#F38B47] hover:text-white border border-[#D96B27]/50 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Launch POS terminal as this outlet"
                >
                  <i className="fa-solid fa-ghost text-xs" />
                  <span>Launch POS</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCockpitResto(null)}
                  className="p-2 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  <i className="fa-solid fa-xmark text-lg" />
                </button>
              </div>
            </div>

            {/* Main Split Body: Left Controls, Right Smartphone Simulator */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* Left Column: Feature Switchboard & Presets */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
                {/* 1-Click Smart Presets Pack */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#D96B27]">
                      ⚡ 1-Click Smart Setup Presets
                    </span>
                    <span className="text-[10px] text-stone-500">Instant configuration templates</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCockpitResto({
                          ...cockpitResto,
                          features: { ...DHABA_PRESET },
                        })
                      }
                      className="p-2.5 rounded-xl border border-[#2D251F] bg-[#14110E] hover:border-[#D96B27] hover:bg-[#1E1914] text-left transition-all cursor-pointer group"
                    >
                      <div className="text-base mb-1">🥘</div>
                      <div className="font-bold text-white text-xs group-hover:text-[#D96B27]">Dhaba Pack</div>
                      <div className="text-[10px] text-stone-400 mt-0.5">Table UPI, Cards, Bottom Bar</div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setCockpitResto({
                          ...cockpitResto,
                          features: { ...FINE_DINE_PRESET },
                        })
                      }
                      className="p-2.5 rounded-xl border border-[#2D251F] bg-[#14110E] hover:border-[#D96B27] hover:bg-[#1E1914] text-left transition-all cursor-pointer group"
                    >
                      <div className="text-base mb-1">🍷</div>
                      <div className="font-bold text-white text-xs group-hover:text-[#D96B27]">Fine Dining</div>
                      <div className="text-[10px] text-stone-400 mt-0.5">Waiter Call, Notes, Review, KDS</div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setCockpitResto({
                          ...cockpitResto,
                          features: { ...CAFE_PRESET },
                        })
                      }
                      className="p-2.5 rounded-xl border border-[#2D251F] bg-[#14110E] hover:border-[#D96B27] hover:bg-[#1E1914] text-left transition-all cursor-pointer group"
                    >
                      <div className="text-base mb-1">☕</div>
                      <div className="font-bold text-white text-xs group-hover:text-[#D96B27]">Cafe &amp; Kiosk</div>
                      <div className="text-[10px] text-stone-400 mt-0.5">Quick KOT, UPI, Upsell</div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setCockpitResto({
                          ...cockpitResto,
                          features: { ...ENTERPRISE_ALL_PRESET },
                        })
                      }
                      className="p-2.5 rounded-xl border border-[#2D251F] bg-[#14110E] hover:border-emerald-500 hover:bg-emerald-950/20 text-left transition-all cursor-pointer group"
                    >
                      <div className="text-base mb-1">⚡</div>
                      <div className="font-bold text-white text-xs group-hover:text-emerald-400">All ON</div>
                      <div className="text-[10px] text-stone-400 mt-0.5">Full Platform Suite</div>
                    </button>
                  </div>
                </div>

                {/* Section 1: Customer Dining Experience */}
                <div className="space-y-3">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#A89F91] block border-b border-[#241E18] pb-1">
                    📱 Customer Self-Ordering &amp; Dining Experience
                  </span>

                  <div className="space-y-2">
                    {[
                      {
                        key: "loyaltyOffers" as const,
                        label: "Loyalty Offers & Mystery Scratch Card",
                        desc: "Top discount banner, Google Pay style scratch card & WhatsApp referral",
                        icon: "🎁",
                      },
                      {
                        key: "tablePayUpi" as const,
                        label: "Instant Table UPI Payment",
                        desc: "Diner scans QR and pays directly via PhonePe / GPay / Paytm",
                        icon: "💳",
                      },
                      {
                        key: "callWaiter" as const,
                        label: "Call Waiter Service Buzzer",
                        desc: "Diner sounds digital chime for Waiter, Water, or Cleaning",
                        icon: "🛎️",
                      },
                      {
                        key: "dishNotes" as const,
                        label: "Cooking Instructions Per Dish",
                        desc: "Allows customer to add 'less spicy', 'crispy' instructions",
                        icon: "✏️",
                      },
                      {
                        key: "smartUpsell" as const,
                        label: "Smart Cart Pairing Upsell",
                        desc: "Recommends companion breads, drinks & desserts before checkout",
                        icon: "💡",
                      },
                      {
                        key: "feedbackReview" as const,
                        label: "5-Star Google Review Booster",
                        desc: "Post-meal rating prompt boosting online reviews",
                        icon: "⭐",
                      },
                    ].map((feat) => {
                      const curFeats = cockpitResto.features || DEFAULT_RESTAURANT_FEATURES;
                      const isEnabled = curFeats[feat.key] ?? true;

                      return (
                        <div
                          key={feat.key}
                          onClick={() =>
                            setCockpitResto({
                              ...cockpitResto,
                              features: {
                                ...curFeats,
                                [feat.key]: !isEnabled,
                              },
                            })
                          }
                          className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                            isEnabled
                              ? "bg-[#1E1A16] border-[#D96B27]/40 text-white"
                              : "bg-[#14110E] border-transparent text-[#7D7466] hover:border-[#2D251F]"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">{feat.icon}</span>
                            <div>
                              <div className="font-bold text-xs">{feat.label}</div>
                              <div className="text-[10px] text-[#8C8275]">{feat.desc}</div>
                            </div>
                          </div>

                          <div
                            className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                              isEnabled ? "bg-[#D96B27] justify-end" : "bg-stone-800 justify-start"
                            }`}
                          >
                            <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Section 2: Kitchen Rail & KDS */}
                <div className="space-y-3">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#A89F91] block border-b border-[#241E18] pb-1">
                    👨‍🍳 Kitchen Rail &amp; Chef Operations
                  </span>

                  <div
                    onClick={() => {
                      const cur = cockpitResto.features || DEFAULT_RESTAURANT_FEATURES;
                      setCockpitResto({
                        ...cockpitResto,
                        features: {
                          ...cur,
                          prepTimeTracker: !cur.prepTimeTracker,
                        },
                      });
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      cockpitResto.features?.prepTimeTracker !== false
                        ? "bg-[#1E1A16] border-[#D96B27]/40 text-white"
                        : "bg-[#14110E] border-transparent text-[#7D7466] hover:border-[#2D251F]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">⏳</span>
                      <div>
                        <div className="font-bold text-xs">Live Prep Time Countdown</div>
                        <div className="text-[10px] text-[#8C8275]">
                          Chefs and waiters can set preparation estimate countdown for each order
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                        cockpitResto.features?.prepTimeTracker !== false
                          ? "bg-[#D96B27] justify-end"
                          : "bg-stone-800 justify-start"
                      }`}
                    >
                      <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                    </div>
                  </div>
                </div>

                {/* Section 3: Mobile & Tablet UI/UX */}
                <div className="space-y-3">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#D96B27] block border-b border-[#241E18] pb-1">
                    📲 Mobile &amp; Tablet UI/UX Navigation Engine
                  </span>

                  {/* Mobile Navigation Style Toggle */}
                  <div className="p-3 bg-[#12100E] border border-[#2D251F] rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-white">Mobile Navigation Style</div>
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                        {cockpitResto.features?.mobileNavStyle === "sidebar" ? "Slide Drawer" : "Bottom Tab Bar (Recommended)"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          const cur = cockpitResto.features || DEFAULT_RESTAURANT_FEATURES;
                          setCockpitResto({
                            ...cockpitResto,
                            features: { ...cur, mobileNavStyle: "bottom_bar" },
                          });
                        }}
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                          cockpitResto.features?.mobileNavStyle !== "sidebar"
                            ? "bg-[#D96B27]/15 border-[#D96B27] text-white shadow-xs"
                            : "bg-[#181410] border-[#2D251F] text-[#8C8275] hover:text-white"
                        }`}
                      >
                        <div className="font-bold flex items-center justify-between">
                          <span>⚡ Bottom Tab Bar</span>
                          {cockpitResto.features?.mobileNavStyle !== "sidebar" && (
                            <span className="text-[10px] text-[#D96B27]">✓ Active</span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#8C8275] mt-0.5">
                          1-Thumb touch docked at bottom (Zomato/Toast POS style)
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const cur = cockpitResto.features || DEFAULT_RESTAURANT_FEATURES;
                          setCockpitResto({
                            ...cockpitResto,
                            features: { ...cur, mobileNavStyle: "sidebar" },
                          });
                        }}
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                          cockpitResto.features?.mobileNavStyle === "sidebar"
                            ? "bg-[#D96B27]/15 border-[#D96B27] text-white shadow-xs"
                            : "bg-[#181410] border-[#2D251F] text-[#8C8275] hover:text-white"
                        }`}
                      >
                        <div className="font-bold flex items-center justify-between">
                          <span>☰ Slide Drawer</span>
                          {cockpitResto.features?.mobileNavStyle === "sidebar" && (
                            <span className="text-[10px] text-[#D96B27]">✓ Active</span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#8C8275] mt-0.5">
                          Top bar with hamburger slide-out sidebar sheet
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Native Bottom Sheets Toggle */}
                  <div
                    onClick={() => {
                      const cur = cockpitResto.features || DEFAULT_RESTAURANT_FEATURES;
                      setCockpitResto({
                        ...cockpitResto,
                        features: {
                          ...cur,
                          mobileSheetModals: cur.mobileSheetModals === false ? true : false,
                        },
                      });
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      cockpitResto.features?.mobileSheetModals !== false
                        ? "bg-[#1E1A16] border-[#D96B27]/40 text-white"
                        : "bg-[#14110E] border-transparent text-[#7D7466] hover:border-[#2D251F]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">📲</span>
                      <div>
                        <div className="font-bold text-xs">Native Bottom Sheet Modals</div>
                        <div className="text-[10px] text-[#8C8275]">
                          Convert modals to bottom sheet drawers with sticky buttons (keyboard friendly)
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                        cockpitResto.features?.mobileSheetModals !== false
                          ? "bg-[#D96B27] justify-end"
                          : "bg-stone-800 justify-start"
                      }`}
                    >
                      <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                    </div>
                  </div>

                  {/* Auto Mobile Cards Toggle */}
                  <div
                    onClick={() => {
                      const cur = cockpitResto.features || DEFAULT_RESTAURANT_FEATURES;
                      setCockpitResto({
                        ...cockpitResto,
                        features: {
                          ...cur,
                          autoMobileCards: cur.autoMobileCards === false ? true : false,
                        },
                      });
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      cockpitResto.features?.autoMobileCards !== false
                        ? "bg-[#1E1A16] border-[#D96B27]/40 text-white"
                        : "bg-[#14110E] border-transparent text-[#7D7466] hover:border-[#2D251F]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🖼️</span>
                      <div>
                        <div className="font-bold text-xs">Auto Mobile Touch Cards</div>
                        <div className="text-[10px] text-[#8C8275]">
                          Auto-switch wide 8-column menu table to 1-tap touch cards on phone screens
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                        cockpitResto.features?.autoMobileCards !== false
                          ? "bg-[#D96B27] justify-end"
                          : "bg-stone-800 justify-start"
                      }`}
                    >
                      <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                    </div>
                  </div>
                </div>

                {/* Section 4: White-Label Branding & 5 Dining Themes */}
                <div className="space-y-3">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#A89F91] block border-b border-[#241E18] pb-1">
                    🎨 White-Label Branding &amp; Signature Theme Palette
                  </span>

                  <div className="p-4 bg-[#14110E] border border-[#2D251F] rounded-xl space-y-4">
                    {/* 5 Themes Selection */}
                    <div>
                      <label className="text-[11px] font-bold text-white block mb-1.5">
                        Signature Brand Persona &amp; Theme
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          {
                            id: "saffron" as const,
                            name: "Punjab Saffron",
                            type: "Highway Dhaba & Tandoor",
                            primary: "#EA580C",
                            border: "#C2410C",
                            icon: "🔥",
                          },
                          {
                            id: "amber" as const,
                            name: "Amber Gold",
                            type: "Family Dining & Biryani",
                            primary: "#FFBE0B",
                            border: "#D97706",
                            icon: "🏆",
                          },
                          {
                            id: "crimson" as const,
                            name: "Royal Crimson",
                            type: "Mughlai & Fine-Dine",
                            primary: "#741A2F",
                            border: "#5E1425",
                            icon: "🍷",
                          },
                          {
                            id: "emerald" as const,
                            name: "Pure Emerald",
                            type: "Pure Veg & South Indian",
                            primary: "#059669",
                            border: "#047857",
                            icon: "🌿",
                          },
                          {
                            id: "charcoal" as const,
                            name: "Midnight Charcoal",
                            type: "Modern Cafe & Bistro",
                            primary: "#F59E0B",
                            border: "#3F3F46",
                            icon: "🖤",
                          },
                        ].map((thm) => {
                          const isSelected = (cockpitResto.theme || "amber") === thm.id;
                          return (
                            <button
                              key={thm.id}
                              type="button"
                              onClick={() => {
                                setCockpitResto({
                                  ...cockpitResto,
                                  theme: thm.id,
                                  branding: {
                                    ...(cockpitResto.branding || DEFAULT_BRANDING_CONFIG),
                                    theme: thm.id,
                                  },
                                });
                              }}
                              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                                isSelected
                                  ? "border-white bg-[#221C16] shadow-md ring-1 ring-white"
                                  : "border-[#2D251F] bg-[#100D0A] hover:border-stone-600 text-stone-400"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-base">{thm.icon}</span>
                                <span
                                  className="w-3.5 h-3.5 rounded-full border border-black/40 shadow-xs"
                                  style={{ backgroundColor: thm.primary }}
                                />
                              </div>
                              <div className="font-bold text-xs text-white leading-tight">{thm.name}</div>
                              <div className="text-[9px] text-stone-400 mt-0.5 truncate">{thm.type}</div>
                              {isSelected && (
                                <span className="absolute top-1.5 right-1.5 text-[9px] text-emerald-400 font-bold">
                                  ✓
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Logo URL & Tagline Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#241E18]">
                      <div>
                        <label className="text-[11px] font-bold text-white block mb-1">
                          Brand Logo URL
                        </label>
                        <div className="flex items-center gap-2">
                          {cockpitResto.branding?.logoUrl ? (
                            <img
                              src={cockpitResto.branding.logoUrl}
                              alt="Logo"
                              className="w-8 h-8 rounded-full object-cover border border-stone-700 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center text-xs shrink-0">
                              🥘
                            </div>
                          )}
                          <input
                            type="text"
                            placeholder="https://.../logo.png"
                            value={cockpitResto.branding?.logoUrl || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCockpitResto({
                                ...cockpitResto,
                                branding: {
                                  ...(cockpitResto.branding || DEFAULT_BRANDING_CONFIG),
                                  theme: cockpitResto.theme || "amber",
                                  logoUrl: val || null,
                                },
                              });
                            }}
                            className="flex-1 px-3 py-1.5 bg-[#1B1612] border border-[#2D251F] rounded-lg text-white text-xs focus:outline-none focus:border-[#D96B27]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-white block mb-1">
                          Custom Tagline / Catchphrase
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Asli Tandoori Swaad since 1998"
                          value={cockpitResto.branding?.tagline || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCockpitResto({
                              ...cockpitResto,
                              branding: {
                                ...(cockpitResto.branding || DEFAULT_BRANDING_CONFIG),
                                theme: cockpitResto.theme || "amber",
                                tagline: val || null,
                              },
                            });
                          }}
                          className="w-full px-3 py-1.5 bg-[#1B1612] border border-[#2D251F] rounded-lg text-white text-xs focus:outline-none focus:border-[#D96B27]"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 5: Retention & Dynamic Offer Engine */}
                <div className="space-y-3">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#A89F91] block border-b border-[#241E18] pb-1">
                    🎁 Customer Retention &amp; Discount Banner Parameters
                  </span>

                  <div className="p-4 bg-[#14110E] border border-[#2D251F] rounded-xl space-y-3">
                    <div>
                      <label className="text-[11px] font-bold text-white block mb-1">
                        Banner Promo Text (Shown at Top of Menu)
                      </label>
                      <input
                        type="text"
                        placeholder="FLAT 20% OFF TODAY · Auto-applied on orders above ₹399"
                        value={cockpitResto.offerConfig?.bannerText || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCockpitResto({
                            ...cockpitResto,
                            offerConfig: {
                              ...(cockpitResto.offerConfig || DEFAULT_OFFER_CONFIG),
                              bannerText: val,
                            },
                          });
                        }}
                        className="w-full px-3 py-2 bg-[#1B1612] border border-[#2D251F] rounded-lg text-white text-xs focus:outline-none focus:border-[#D96B27]"
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                      <div>
                        <label className="text-[10px] font-bold text-stone-400 block mb-1">
                          Discount %
                        </label>
                        <input
                          type="number"
                          value={cockpitResto.offerConfig?.discountPercent ?? 20}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setCockpitResto({
                              ...cockpitResto,
                              offerConfig: {
                                ...(cockpitResto.offerConfig || DEFAULT_OFFER_CONFIG),
                                discountPercent: val,
                              },
                            });
                          }}
                          className="w-full px-2.5 py-1.5 bg-[#1B1612] border border-[#2D251F] rounded-lg text-white text-xs focus:outline-none focus:border-[#D96B27]"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-stone-400 block mb-1">
                          Min Order (₹)
                        </label>
                        <input
                          type="number"
                          value={cockpitResto.offerConfig?.minOrderValue ?? 399}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setCockpitResto({
                              ...cockpitResto,
                              offerConfig: {
                                ...(cockpitResto.offerConfig || DEFAULT_OFFER_CONFIG),
                                minOrderValue: val,
                              },
                            });
                          }}
                          className="w-full px-2.5 py-1.5 bg-[#1B1612] border border-[#2D251F] rounded-lg text-white text-xs focus:outline-none focus:border-[#D96B27]"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-stone-400 block mb-1">
                          Voucher Code
                        </label>
                        <input
                          type="text"
                          value={cockpitResto.offerConfig?.bounceBackCode || "REPEAT100"}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCockpitResto({
                              ...cockpitResto,
                              offerConfig: {
                                ...(cockpitResto.offerConfig || DEFAULT_OFFER_CONFIG),
                                bounceBackCode: val,
                              },
                            });
                          }}
                          className="w-full px-2.5 py-1.5 bg-[#1B1612] border border-[#2D251F] rounded-lg text-white text-xs focus:outline-none focus:border-[#D96B27]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-stone-400 block mb-1">
                        Mystery Scratch Card Reward Title
                      </label>
                      <input
                        type="text"
                        placeholder="₹100 OFF on your next visit (Min order ₹499)"
                        value={cockpitResto.offerConfig?.bounceBackReward || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCockpitResto({
                            ...cockpitResto,
                            offerConfig: {
                              ...(cockpitResto.offerConfig || DEFAULT_OFFER_CONFIG),
                              bounceBackReward: val,
                            },
                          });
                        }}
                        className="w-full px-3 py-1.5 bg-[#1B1612] border border-[#2D251F] rounded-lg text-white text-xs focus:outline-none focus:border-[#D96B27]"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 6: WhatsApp Setup Sender */}
                <div className="p-4 bg-[#141F17] border border-emerald-800/60 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="fa-brands fa-whatsapp text-emerald-400 text-lg" />
                      <span className="font-bold text-white">Send Setup Summary to Owner</span>
                    </div>
                    {copiedCockpitLink && <span className="text-emerald-400 font-bold font-mono">✓ Link Copied!</span>}
                  </div>
                  <p className="text-[11px] text-emerald-200/80">
                    Sends a complete formatted WhatsApp message containing the active feature list, credentials, and magic login link directly to {cockpitResto.ownerName}.
                  </p>

                  <div className="flex items-center gap-2">
                    <a
                      href={getWhatsAppSetupUrl(cockpitResto)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40"
                    >
                      <i className="fa-brands fa-whatsapp text-base" />
                      <span>Dispatch WhatsApp Message</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        const origin = typeof window !== "undefined" ? window.location.origin : "";
                        const loginUrl = `${origin}/login?resto=${cockpitResto.id}&role=owner`;
                        navigator.clipboard.writeText(loginUrl);
                        setCopiedCockpitLink(true);
                        setTimeout(() => setCopiedCockpitLink(false), 2500);
                      }}
                      className="px-3 py-2.5 bg-[#1F2E23] hover:bg-[#283D2F] text-emerald-300 border border-emerald-700/60 rounded-lg font-semibold"
                      title="Copy Magic Login Link"
                    >
                      <i className="fa-solid fa-copy" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Smartphone Simulator */}
              <div className="w-80 shrink-0 hidden lg:flex flex-col items-center justify-start p-6 bg-[#100D0A] border-l border-[#241E18] space-y-3">
                <div className="flex items-center justify-between w-full font-mono text-[10px] text-stone-400 uppercase">
                  <span>Live Smartphone Screen Mirror</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>

                {/* Smartphone Device Frame */}
                <div className="w-68 h-[540px] bg-black rounded-[38px] border-4 border-[#3A3026] shadow-2xl relative overflow-hidden flex flex-col">
                  {/* Dynamic Island / Camera Notch */}
                  <div className="w-20 h-4 bg-black rounded-b-xl mx-auto z-20 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-stone-900 border border-stone-800" />
                  </div>

                  {/* Simulator Screen Content */}
                  {/* Simulator Screen Content */}
                  {(() => {
                    const thm = cockpitResto.theme || "amber";
                    const themeColorMap: Record<string, { bg: string; surface: string; border: string; primary: string; pill: string }> = {
                      saffron: { bg: "#1A110D", surface: "#2C1810", border: "#432517", primary: "#EA580C", pill: "bg-orange-500/20 text-orange-300" },
                      amber: { bg: "#1A1612", surface: "#241E18", border: "#3A321B", primary: "#FFBE0B", pill: "bg-amber-500/20 text-amber-300" },
                      crimson: { bg: "#1B0B11", surface: "#2E1218", border: "#5E1425", primary: "#741A2F", pill: "bg-rose-500/20 text-rose-300" },
                      emerald: { bg: "#0B1B14", surface: "#0B291D", border: "#0A664E", primary: "#059669", pill: "bg-emerald-500/20 text-emerald-300" },
                      charcoal: { bg: "#121214", surface: "#202024", border: "#3F3F46", primary: "#F59E0B", pill: "bg-amber-500/20 text-amber-300" },
                    };
                    const activeThemeStyles = themeColorMap[thm] || themeColorMap.amber;

                    return (
                      <div
                        className="flex-1 flex flex-col text-white p-3 pt-1 overflow-hidden text-[11px] select-none transition-colors duration-300"
                        style={{ backgroundColor: activeThemeStyles.bg }}
                      >
                        {/* Simulator Top Nav */}
                        <div
                          className="flex items-center justify-between border-b pb-2 mb-2"
                          style={{ borderColor: activeThemeStyles.border }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {cockpitResto.branding?.logoUrl ? (
                              <img
                                src={cockpitResto.branding.logoUrl}
                                alt="Logo"
                                className="w-5 h-5 rounded-full object-cover border border-white/20 shrink-0"
                              />
                            ) : (
                              <span className="text-xs">
                                {thm === "saffron" ? "🔥" : thm === "emerald" ? "🌿" : thm === "crimson" ? "🍷" : thm === "charcoal" ? "🖤" : "🥘"}
                              </span>
                            )}
                            <div className="min-w-0">
                              <div className="font-bold truncate text-[11px] leading-tight">{cockpitResto.name}</div>
                              {cockpitResto.branding?.tagline && (
                                <div className="text-[8px] text-stone-400 truncate leading-none mt-0.5">
                                  {cockpitResto.branding.tagline}
                                </div>
                              )}
                            </div>
                          </div>
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${activeThemeStyles.pill}`}>
                            Table T04
                          </span>
                        </div>

                        {/* Simulator Dynamic Modules */}
                        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                          {/* Offer Banner Preview */}
                          {cockpitResto.features?.loyaltyOffers !== false && (
                            <div className="p-2 rounded-lg bg-gradient-to-r from-amber-950/70 to-orange-950/70 border border-amber-600/50 text-[9px] flex items-center justify-between">
                              <span className="font-bold text-amber-300 truncate">
                                🔥 {cockpitResto.offerConfig?.bannerText || "FLAT 20% OFF TODAY"}
                              </span>
                              <span className="bg-amber-500 text-stone-950 px-1 py-0.2 rounded font-black text-[8px] shrink-0">
                                20%
                              </span>
                            </div>
                          )}

                          {/* Call Waiter Pill */}
                          {cockpitResto.features?.callWaiter !== false && (
                            <div
                              className="p-2 rounded-lg border flex items-center justify-between text-[10px]"
                              style={{ backgroundColor: activeThemeStyles.surface, borderColor: activeThemeStyles.border }}
                            >
                              <span className="flex items-center gap-1">
                                <span>🛎️</span>
                                <span>Service Bell Active</span>
                              </span>
                              <span className="font-bold" style={{ color: activeThemeStyles.primary }}>Ring</span>
                            </div>
                          )}

                          {/* Sample Food Card */}
                          <div
                            className="p-2.5 rounded-lg border space-y-1.5"
                            style={{ backgroundColor: activeThemeStyles.surface, borderColor: activeThemeStyles.border }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white">Paneer Butter Masala</span>
                              <span className="font-mono font-bold" style={{ color: activeThemeStyles.primary }}>₹310</span>
                            </div>
                            {cockpitResto.features?.dishNotes !== false && (
                              <div className="text-[9px] text-stone-400 italic bg-black/40 px-2 py-0.5 rounded">
                                ✏️ Note: Extra gravy, less butter...
                              </div>
                            )}
                          </div>

                          {/* Smart Upsell Preview */}
                          {cockpitResto.features?.smartUpsell !== false && (
                            <div className="p-2 rounded-lg bg-amber-950/30 border border-amber-800/40 text-[9px] space-y-1">
                              <div className="font-bold text-amber-300 flex items-center gap-1">
                                <span>💡</span>
                                <span>Pair with Garlic Naan</span>
                              </div>
                              <div className="text-stone-400">+₹75 • 82% diners add this</div>
                            </div>
                          )}

                          {/* Mystery Scratch Reward Button */}
                          {cockpitResto.features?.loyaltyOffers !== false && (
                            <div className="p-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-400 text-stone-950 font-black text-[9px] flex items-center justify-center gap-1 shadow-xs">
                              <span>🎁</span>
                              <span>Scratch Mystery Reward (₹100 Voucher)</span>
                            </div>
                          )}

                          {/* Table Pay UPI QR Preview */}
                          {cockpitResto.features?.tablePayUpi !== false && (
                            <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-[9px] flex items-center justify-between">
                              <span className="flex items-center gap-1.5 font-bold text-emerald-300">
                                <span>💳</span>
                                <span>Instant UPI Settlement</span>
                              </span>
                              <span className="bg-emerald-500 text-black px-1.5 py-0.5 rounded font-bold text-[8px]">
                                PAY NOW
                              </span>
                            </div>
                          )}

                          {/* Review Booster */}
                          {cockpitResto.features?.feedbackReview !== false && (
                            <div className="p-2 rounded-lg bg-stone-900 border border-stone-800 text-[9px] text-center">
                              <span className="text-amber-400">⭐⭐⭐⭐⭐</span>
                              <div className="text-stone-400 text-[8px]">Google 5-Star Review Prompt</div>
                            </div>
                          )}
                        </div>

                        {/* Bottom Nav Simulation */}
                        <div
                          className="pt-2 border-t mt-1 shrink-0"
                          style={{ borderColor: activeThemeStyles.border }}
                        >
                          {cockpitResto.features?.mobileNavStyle !== "sidebar" ? (
                            <div className="flex justify-around text-[9px] font-mono text-stone-400">
                              <span className="font-bold" style={{ color: activeThemeStyles.primary }}>Floor</span>
                              <span>Tables</span>
                              <span>Kitchen</span>
                              <span>Menu</span>
                              <span>Staff</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between text-[9px] text-stone-400 px-1">
                              <span>☰ Menu Drawer</span>
                              <span>Cast-Iron Sidebar Mode</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Home Bar Indicator */}
                  <div className="w-24 h-1 bg-stone-600 rounded-full mx-auto my-1.5 z-20 shrink-0" />
                </div>

                <p className="text-[10px] text-stone-500 text-center font-mono">
                  Changes update screen mirror in realtime.
                </p>
              </div>
            </div>

            {/* Sticky Cockpit Footer */}
            <div className="p-4 bg-[#14110E] border-t border-[#26201B] flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setCockpitResto(null)}
                className="px-4 py-2 bg-[#221C17] hover:bg-[#2C241E] text-stone-400 hover:text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel / Discard
              </button>

              <button
                type="button"
                onClick={handleSaveCockpit}
                disabled={isSavingCockpit}
                className="px-6 py-2.5 bg-gradient-to-r from-[#D96B27] to-[#B85418] hover:from-[#E3752F] text-white rounded-lg text-xs font-bold shadow-lg shadow-[#D96B27]/25 flex items-center gap-2 cursor-pointer transition-transform active:scale-95 disabled:opacity-50"
              >
                <i className={`fa-solid ${isSavingCockpit ? "fa-circle-notch animate-spin" : "fa-floppy-disk"}`} />
                <span>{isSavingCockpit ? "Saving Cockpit..." : "Save Cockpit Configuration"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
