"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ShareMenuModal, { ShareMenuTable } from "@/components/ShareMenuModal";

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
  theme?: "amber" | "crimson";
  features?: {
    callWaiter: boolean;
    prepTimeTracker: boolean;
    customRequests: boolean;
    tablePayUpi: boolean;
    dishNotes: boolean;
    smartUpsell: boolean;
    feedbackReview: boolean;
  };
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

  // Filter restaurants locally based on search
  const filteredRestaurants = restaurants.filter((r) => {
    const matchesSearch =
      !searchQuery ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.ownerEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
    <div className="min-h-screen bg-[#12100E] text-[#EDE8DF] font-sans antialiased selection:bg-[#D96B27] selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-[#1F1A15] border border-[#D96B27] text-white px-5 py-3.5 rounded-lg shadow-2xl animate-fade-in text-sm font-medium">
          <i className="fa-solid fa-circle-check text-[#D96B27] text-base" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="border-b border-[#26201B] bg-[#181410]/95 backdrop-blur-md sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#D96B27] to-[#B35218] flex items-center justify-center shadow-lg shadow-[#D96B27]/20 border border-[#FF8A42]/30">
            <i className="fa-solid fa-server text-white text-lg" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#D96B27]">Platform Command Deck</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#D96B27]/15 text-[#F38B47] border border-[#D96B27]/30">SUPER ADMIN</span>
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              Order Desk Multi-Tenant Control
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Heartbeat Badge */}
          <div className="hidden sm:flex items-center gap-2 bg-[#1F1A15] border border-[#2E2721] px-3 py-1.5 rounded-full text-xs font-mono text-[#A89F91]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>GLOBAL REALTIME ACTIVE</span>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 bg-[#221C17] hover:bg-[#2A231C] text-[#D8D0C3] border border-[#3A3129] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
          >
            <i className="fa-solid fa-arrow-left text-[#8C8275]" />
            <span>Go to Floor POS</span>
          </Link>

          <button
            onClick={handleSuperAdminSignOut}
            className="flex items-center gap-2 bg-[#221C17] hover:bg-red-950/60 hover:text-red-300 hover:border-red-800 text-[#8C8275] border border-[#3A3129] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            title="Sign out of Super Admin"
          >
            <i className="fa-solid fa-arrow-right-from-bracket" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Command Deck Canvas */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
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
                  <th className="px-6 py-3.5">Restaurant</th>
                  <th className="px-6 py-3.5">Owner & Contact</th>
                  <th className="px-6 py-3.5">Plan & Tier</th>
                  <th className="px-6 py-3.5">Live Metrics</th>
                  <th className="px-6 py-3.5">Subscription</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#241F1A]">
                {loading && restaurants.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-[#8C8275] font-mono">
                      <i className="fa-solid fa-circle-notch animate-spin text-lg text-[#D96B27] mb-2 block" />
                      Loading platform tenant records...
                    </td>
                  </tr>
                ) : filteredRestaurants.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-[#8C8275] font-mono">
                      No restaurants match your filter. Click &quot;+ Onboard New Restaurant&quot; to add one.
                    </td>
                  </tr>
                ) : (
                  filteredRestaurants.map((r) => {
                    const isArchived = Boolean(r.isArchived || r.subscriptionStatus === "cancelled");
                    const isActive = r.subscriptionStatus === "active" && !isArchived;
                    return (
                      <tr
                        key={r.id}
                        className={`transition-colors ${
                          isArchived ? "bg-amber-950/10 hover:bg-amber-950/20" : "hover:bg-[#1E1914]/60"
                        }`}
                      >
                        {/* Restaurant Name & ID */}
                        <td className="px-6 py-4">
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
    </div>
  );
}
