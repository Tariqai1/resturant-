"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type StaffPermissions = {
  canEditOrders: boolean;
  canDeleteOrders: boolean;
  assignedPin?: string;
};

type StaffMember = {
  id: string;
  name: string;
  role: "waiter" | "captain" | "kitchen" | "cashier" | "manager" | "owner" | "admin" | "staff";
  is_active: boolean;
  created_at: string;
  permissions?: StaffPermissions;
};

const roleBadges: Record<string, { label: string; color: string; bg: string; border: string }> = {
  owner: { label: "Owner", color: "text-amber-300", bg: "bg-amber-950/40", border: "border-amber-800/60" },
  admin: { label: "Administrator", color: "text-purple-300", bg: "bg-purple-950/40", border: "border-purple-800/60" },
  manager: { label: "Manager", color: "text-indigo-300", bg: "bg-indigo-950/40", border: "border-indigo-800/60" },
  captain: { label: "Captain", color: "text-blue-300", bg: "bg-blue-950/40", border: "border-blue-800/60" },
  cashier: { label: "Cashier", color: "text-emerald-300", bg: "bg-emerald-950/40", border: "border-emerald-800/60" },
  waiter: { label: "Waiter / Staff", color: "text-sky-300", bg: "bg-sky-950/40", border: "border-sky-800/60" },
  staff: { label: "Waiter / Staff", color: "text-sky-300", bg: "bg-sky-950/40", border: "border-sky-800/60" },
  kitchen: { label: "Kitchen KDS", color: "text-orange-300", bg: "bg-orange-950/40", border: "border-orange-800/60" },
};

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [restaurantName, setRestaurantName] = useState<string>("Order Desk");
  const [restaurantId, setRestaurantId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal States
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [resettingPinMember, setResettingPinMember] = useState<StaffMember | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showKitchenModal, setShowKitchenModal] = useState(false);
  const [copiedKitchenLink, setCopiedKitchenLink] = useState(false);
  const [staffSuccessModal, setStaffSuccessModal] = useState<{
    id: string;
    name: string;
    role: string;
    pin: string;
    phone?: string;
  } | null>(null);
  const [copiedStaffLink, setCopiedStaffLink] = useState(false);

  // New Staff Form
  const [newStaff, setNewStaff] = useState({
    name: "",
    role: "waiter" as StaffMember["role"],
    pin: "",
    phone: "",
    canEditOrders: false,
    canDeleteOrders: false,
  });

  // Edit Permissions Form
  const [editForm, setEditForm] = useState({
    role: "waiter" as StaffMember["role"],
    canEditOrders: false,
    canDeleteOrders: false,
  });

  // Reset PIN Form
  const [newPin, setNewPin] = useState("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    loadStaff();
  }, []);

  async function loadStaff() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/staff");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load staff");
      setStaff(data.staff || []);
      if (data.restaurantName) setRestaurantName(data.restaurantName);
      if (data.restaurantId) setRestaurantId(data.restaurantId);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Error loading staff");
    } finally {
      setIsLoading(false);
    }
  }

  // Handle Role Change in Add Form to update default permissions
  function handleAddRoleChange(role: StaffMember["role"]) {
    const isOwner = role === "owner" || role === "admin" || role === "manager";
    const isWaiter = role === "waiter" || role === "captain" || role === "staff";
    setNewStaff((prev) => ({
      ...prev,
      role,
      canEditOrders: isOwner || isWaiter,
      canDeleteOrders: isOwner,
    }));
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!newStaff.name.trim() || !newStaff.pin) return;
    if (!/^\d{4}$/.test(newStaff.pin)) {
      alert("PIN must be exactly 4 digits (e.g. 1234)");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newStaff),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to add staff member");

      const createdStaff = data.staff;
      const createdPin = newStaff.pin;
      const staffPhone = newStaff.phone;

      setIsAddingStaff(false);
      setNewStaff({
        name: "",
        role: "waiter",
        pin: "",
        phone: "",
        canEditOrders: false,
        canDeleteOrders: false,
      });

      setStaffSuccessModal({
        id: createdStaff?.id || "",
        name: createdStaff?.name || "Staff Member",
        role: createdStaff?.role || "waiter",
        pin: createdPin,
        phone: staffPhone,
      });

      showToast(`Staff member "${createdStaff?.name || "Member"}" created successfully!`);
      await loadStaff();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add staff");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSavePermissions(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStaff) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: editingStaff.id,
          role: editForm.role,
          canEditOrders: editForm.canEditOrders,
          canDeleteOrders: editForm.canDeleteOrders,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update permissions");

      setEditingStaff(null);
      showToast(`Permissions updated for ${editingStaff.name}!`);
      await loadStaff();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resettingPinMember || !newPin) return;
    if (!/^\d{4}$/.test(newPin)) {
      alert("PIN must be exactly 4 digits (e.g. 1234)");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: resettingPinMember.id,
          newPin,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to reset PIN");

      setResettingPinMember(null);
      setNewPin("");
      showToast(`PIN reset successfully for ${resettingPinMember.name}!`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "PIN reset failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleStatus(member: StaffMember) {
    if (member.role === "owner") {
      alert("Owner account status cannot be toggled.");
      return;
    }
    const nextState = !member.is_active;
    try {
      const res = await fetch("/api/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: member.id, isActive: nextState }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      setStaff((prev) =>
        prev.map((s) => (s.id === member.id ? { ...s, is_active: nextState } : s))
      );
      showToast(`${member.name} marked as ${nextState ? "Active" : "Inactive"}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error updating status");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row antialiased">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-slate-900 border border-orange-500 text-white px-5 py-3.5 rounded-xl shadow-2xl animate-fade-in text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800 p-5 flex flex-col justify-between flex-shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-8 px-2 pt-2">
            <div className="w-9 h-9 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-950/40 font-extrabold text-sm">
              OD
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight text-white leading-tight">Order Desk</h1>
              <p className="text-xs text-slate-400 font-medium truncate max-w-[140px]">{restaurantName}</p>
            </div>
          </div>

          <nav className="space-y-1 text-xs font-medium">
            <Link
              href="/"
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all"
            >
              <span>◈</span>
              <span>Overview POS</span>
            </Link>

            <Link
              href="/kitchen"
              className="flex items-center justify-between px-3.5 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all"
            >
              <div className="flex items-center gap-3">
                <span>♨</span>
                <span>Kitchen Rail (KDS)</span>
              </div>
              <span className="bg-orange-500/20 text-orange-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                Live
              </span>
            </Link>

            <Link
              href="/tables"
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all"
            >
              <span>▦</span>
              <span>Floor Tables</span>
            </Link>

            <Link
              href="/menu"
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all"
            >
              <span>✦</span>
              <span>Menu & Stock</span>
            </Link>

            <Link
              href="/staff"
              className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-orange-600/15 border border-orange-500/30 text-orange-400 font-semibold shadow-inner"
            >
              <div className="flex items-center gap-3">
                <span>♧</span>
                <span>Staff & Roles</span>
              </div>
              <span className="bg-orange-600 text-white text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
                {staff.length}
              </span>
            </Link>
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-800">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800/60 transition-colors"
          >
            <span>←</span>
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 bg-slate-950 p-6 md:p-8 space-y-6 overflow-y-auto">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-orange-400 font-bold">
              <span>TEAM &amp; TERMINAL ACCESS</span>
              <span>•</span>
              <span>ROLE-BASED PERMISSIONS</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight mt-1">
              Staff &amp; Permissions Deck
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Assign roles, configure granular order edit/void rights, and issue 4-digit POS PINs for shared terminals.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowKitchenModal(true)}
              className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm"
              title="Open or Share 1-Tap Kitchen Display Link"
            >
              <span>🍳</span>
              <span>Kitchen KDS Link</span>
            </button>

            <button
              onClick={() => setIsAddingStaff(true)}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-orange-950/50 border border-orange-400/30 transition-all cursor-pointer"
            >
              <span>+</span>
              <span>Add New Staff</span>
            </button>
          </div>
        </header>

        {/* Staff Table Section */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
            <div className="flex items-center gap-3">
              <span className="font-bold text-sm text-white uppercase tracking-wider">Active Team Roster</span>
              <span className="bg-slate-800 text-slate-300 text-xs px-2 py-0.5 rounded-full font-mono">
                {staff.length} Members
              </span>
            </div>
            <span className="hidden sm:inline text-[11px] text-slate-400 font-mono">
              Fast 4-digit PIN authentication active
            </span>
          </div>

          {isLoading && (
            <div className="p-12 text-center text-slate-400 text-xs font-mono">
              Loading team members...
            </div>
          )}

          {!isLoading && errorMessage && (
            <div className="p-8 text-center text-red-400 text-xs bg-red-950/20 border-b border-red-900/30 font-mono">
              {errorMessage}
            </div>
          )}

          {!isLoading && !errorMessage && staff.length === 0 && (
            <div className="p-12 text-center text-slate-400 text-xs">
              No staff members registered. Click "+ Add New Staff" to create your team.
            </div>
          )}

          {!isLoading && !errorMessage && staff.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 font-mono uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3.5">Staff Name</th>
                    <th className="px-6 py-3.5">Role</th>
                    <th className="px-6 py-3.5">Order Permissions</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Joined</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {staff.map((member) => {
                    const badge = roleBadges[member.role] || roleBadges.waiter;
                    const canEdit = member.role === "owner" || member.role === "admin" || member.role === "manager" || Boolean(member.permissions?.canEditOrders);
                    const canDelete = member.role === "owner" || member.role === "admin" || member.role === "manager" || Boolean(member.permissions?.canDeleteOrders);

                    return (
                      <tr key={member.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-white text-sm">{member.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">ID: {member.id.slice(0, 8)}</div>
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold border ${badge.bg} ${badge.color} ${badge.border}`}
                          >
                            {badge.label}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${
                                canEdit
                                  ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/60"
                                  : "bg-slate-800/50 text-slate-500 border-slate-700/50"
                              }`}
                              title={canEdit ? "Can add dishes and edit quantities" : "Cannot edit running orders"}
                            >
                              <span>{canEdit ? "✓" : "✕"}</span>
                              <span>Edit Orders</span>
                            </span>

                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${
                                canDelete
                                  ? "bg-amber-950/40 text-amber-300 border-amber-800/60"
                                  : "bg-slate-800/50 text-slate-500 border-slate-700/50"
                              }`}
                              title={canDelete ? "Can void and cancel orders" : "Cannot delete/void running orders"}
                            >
                              <span>{canDelete ? "✓" : "✕"}</span>
                              <span>Void Orders</span>
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <button
                            onClick={() => toggleStatus(member)}
                            disabled={member.role === "owner"}
                            className="flex items-center gap-1.5 focus:outline-none cursor-pointer disabled:cursor-not-allowed"
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                member.is_active ? "bg-emerald-400" : "bg-slate-600"
                              }`}
                            />
                            <span
                              className={`text-[11px] font-mono font-bold ${
                                member.is_active ? "text-emerald-400" : "text-slate-500"
                              }`}
                            >
                              {member.is_active ? "ACTIVE" : "INACTIVE"}
                            </span>
                          </button>
                        </td>

                        <td className="px-6 py-4 text-slate-400 font-mono text-[11px]">
                          {new Date(member.created_at).toLocaleDateString("en-IN")}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* WhatsApp Shift Invite */}
                            <a
                              href={(() => {
                                const origin = typeof window !== "undefined" ? window.location.origin : "";
                                const staffLoginUrl = `${origin}/login?resto=${restaurantId}&role=${member.role}&staff=${member.id}`;
                                const roleLabel = member.role === "kitchen" ? "Kitchen KDS" : member.role === "owner" ? "Owner / Manager" : "Waiter";
                                const pinText = member.permissions?.assignedPin ? `\n🔑 *PIN*: ${member.permissions.assignedPin}` : "";
                                const msg = `👋 *${restaurantName} - Shift Access*\n\nNamaste *${member.name}*!\nYour shift terminal access is ready:\n🔗 *Direct Login*: ${staffLoginUrl}\n👤 *Staff Name*: ${member.name}\n💼 *Role*: ${roleLabel}${pinText}\n\nOpen this link on your phone to clock into your shift!`;
                                return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
                              })()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                              title="Send Shift Access Link via WhatsApp"
                            >
                              <span>📲</span>
                              <span>Share</span>
                            </a>

                            {/* Reset PIN */}
                            <button
                              onClick={() => {
                                setResettingPinMember(member);
                                setNewPin("");
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                              title="Reset 4-Digit POS PIN"
                            >
                              PIN
                            </button>

                            {/* Edit Permissions */}
                            {member.role !== "owner" && (
                              <button
                                onClick={() => {
                                  setEditingStaff(member);
                                  setEditForm({
                                    role: member.role,
                                    canEditOrders: Boolean(member.permissions?.canEditOrders),
                                    canDeleteOrders: Boolean(member.permissions?.canDeleteOrders),
                                  });
                                }}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                              >
                                Edit
                              </button>
                            )}

                            {/* Activate / Deactivate */}
                            {member.role !== "owner" && (
                              <button
                                onClick={() => toggleStatus(member)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer border ${
                                  member.is_active
                                    ? "bg-red-950/20 text-red-400 border-red-900/40 hover:bg-red-900/30"
                                    : "bg-emerald-950/20 text-emerald-400 border-emerald-900/40 hover:bg-emerald-900/30"
                                }`}
                              >
                                {member.is_active ? "Deactivate" : "Activate"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* MODAL 1: ADD NEW STAFF MEMBER */}
        {isAddingStaff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-orange-400 font-bold uppercase tracking-wider">
                    NEW RECRUIT
                  </span>
                  <h3 className="text-base font-bold text-white">Create Staff Member</h3>
                </div>
                <button
                  onClick={() => setIsAddingStaff(false)}
                  className="text-slate-400 hover:text-white text-lg p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleAddStaff} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Staff Full Name
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Ramesh Kumar"
                    value={newStaff.name}
                    onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Station Role
                  </label>
                  <select
                    value={newStaff.role}
                    onChange={(e) => handleAddRoleChange(e.target.value as StaffMember["role"])}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="waiter">🛎️ Waiter (Floor Orders, Tables &amp; Service)</option>
                    <option value="kitchen">🍳 Kitchen (Cooking &amp; KDS Display Only)</option>
                    <option value="owner">👑 Owner / Manager (Full Access &amp; Billing)</option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Owner has full control. Waiters take orders on the floor. Kitchen only accesses /kitchen.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    4-Digit POS PIN
                  </label>
                  <input
                    required
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="e.g. 5678"
                    value={newStaff.pin}
                    onChange={(e) => setNewStaff({ ...newStaff, pin: e.target.value.replace(/\D/g, "") })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white tracking-[6px] focus:outline-none focus:border-orange-500"
                  />
                  <small className="text-[10px] text-slate-500 block mt-1">
                    Used for fast PIN switching on counter tablet / station terminal.
                  </small>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1 flex items-center justify-between">
                    <span>Staff WhatsApp / Phone (Optional)</span>
                    <span className="text-emerald-400">📲</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={newStaff.phone}
                    onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500"
                  />
                  <small className="text-[10px] text-slate-500 block mt-1">
                    Enter phone to instantly WhatsApp their 1-tap shift login link and PIN.
                  </small>
                </div>

                {/* Granular Order Permissions */}
                <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl space-y-2.5">
                  <span className="text-[11px] font-bold text-slate-300 uppercase block">
                    Order Action Permissions
                  </span>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newStaff.canEditOrders}
                      onChange={(e) => setNewStaff({ ...newStaff, canEditOrders: e.target.checked })}
                      className="mt-0.5 rounded bg-slate-900 border-slate-700 text-orange-500 focus:ring-orange-500 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-semibold text-white block">Allow Edit Orders</span>
                      <span className="text-[11px] text-slate-400 block">
                        Can add items or change item quantities on running customer orders.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newStaff.canDeleteOrders}
                      onChange={(e) => setNewStaff({ ...newStaff, canDeleteOrders: e.target.checked })}
                      className="mt-0.5 rounded bg-slate-900 border-slate-700 text-orange-500 focus:ring-orange-500 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-semibold text-white block">Allow Void / Delete Orders</span>
                      <span className="text-[11px] text-slate-400 block">
                        Can cancel running orders and clear active tables without manager override.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddingStaff(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white shadow-md transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? "Creating..." : "Save Staff Member"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: EDIT PERMISSIONS & ROLE */}
        {editingStaff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-orange-400 font-bold uppercase tracking-wider">
                    MODIFY ACCESS
                  </span>
                  <h3 className="text-base font-bold text-white">Permissions: {editingStaff.name}</h3>
                </div>
                <button
                  onClick={() => setEditingStaff(null)}
                  className="text-slate-400 hover:text-white text-lg p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSavePermissions} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Assign Role
                  </label>
                  <select
                    value={editForm.role}
                    onChange={(e) => {
                      const r = e.target.value as StaffMember["role"];
                      const isOwner = r === "owner" || r === "manager" || r === "admin";
                      const isWaiter = r === "waiter" || r === "captain" || r === "staff";
                      setEditForm({
                        role: r,
                        canEditOrders: isOwner || isWaiter || editForm.canEditOrders,
                        canDeleteOrders: isOwner || editForm.canDeleteOrders,
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="waiter">🛎️ Waiter (Floor Orders, Tables &amp; Service)</option>
                    <option value="kitchen">🍳 Kitchen (Cooking &amp; KDS Display Only)</option>
                    <option value="owner">👑 Owner / Manager (Full Access &amp; Billing)</option>
                  </select>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-bold text-slate-300 uppercase block">
                    Granular Order Permissions
                  </span>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.canEditOrders}
                      onChange={(e) => setEditForm({ ...editForm, canEditOrders: e.target.checked })}
                      className="mt-0.5 rounded bg-slate-900 border-slate-700 text-orange-500 focus:ring-orange-500 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-semibold text-white block">Can Edit Running Orders</span>
                      <span className="text-[11px] text-slate-400 block">
                        Allow adding dishes or editing quantities on active table orders.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.canDeleteOrders}
                      onChange={(e) => setEditForm({ ...editForm, canDeleteOrders: e.target.checked })}
                      className="mt-0.5 rounded bg-slate-900 border-slate-700 text-orange-500 focus:ring-orange-500 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-semibold text-white block">Can Void / Delete Orders</span>
                      <span className="text-[11px] text-slate-400 block">
                        Allow cancelling active tickets and resetting table occupancy.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingStaff(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white shadow-md transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? "Updating..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 3: RESET PIN */}
        {resettingPinMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-orange-400 font-bold uppercase tracking-wider">
                    SECURITY CREDENTIALS
                  </span>
                  <h3 className="text-base font-bold text-white">Reset PIN: {resettingPinMember.name}</h3>
                </div>
                <button
                  onClick={() => setResettingPinMember(null)}
                  className="text-slate-400 hover:text-white text-lg p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleResetPinSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    New 4-Digit POS PIN
                  </label>
                  <input
                    required
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="e.g. 1234"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white tracking-[6px] focus:outline-none focus:border-orange-500"
                  />
                  <small className="text-[10px] text-slate-500 block mt-1">
                    Enter the new 4-digit code the staff member will enter on POS terminals.
                  </small>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setResettingPinMember(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || newPin.length !== 4}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white shadow-md transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? "Resetting..." : "Update PIN"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 4: STAFF CREATED & WHATSAPP DISPATCH */}
        {staffSuccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto text-xl shadow-lg">
                  🎉
                </div>
                <h3 className="text-base font-bold text-white">Staff Member Created!</h3>
                <p className="text-xs text-slate-400">
                  Send shift login instructions and PIN directly to {staffSuccessModal.name}.
                </p>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs font-mono">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Name:</span>
                  <span className="text-white font-bold">{staffSuccessModal.name}</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Role:</span>
                  <span className="text-orange-400 font-bold uppercase">{staffSuccessModal.role}</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>4-Digit PIN:</span>
                  <span className="text-amber-400 font-bold bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/60 tracking-widest">
                    {staffSuccessModal.pin}
                  </span>
                </div>
              </div>

              {/* Direct Link */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1">
                <div className="text-[10px] uppercase font-mono text-slate-400 flex justify-between">
                  <span>1-Tap Shift Login Link:</span>
                  {copiedStaffLink && <span className="text-emerald-400 font-bold">✓ Copied</span>}
                </div>
                <div className="text-xs font-mono text-slate-300 break-all bg-black/40 p-2 rounded border border-slate-800">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/login?resto=${restaurantId}&role=${staffSuccessModal.role}&staff=${staffSuccessModal.id}&pin=${staffSuccessModal.pin}`
                    : ""}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <a
                  href={(() => {
                    const origin = typeof window !== "undefined" ? window.location.origin : "";
                    const loginUrl = `${origin}/login?resto=${restaurantId}&role=${staffSuccessModal.role}&staff=${staffSuccessModal.id}&pin=${staffSuccessModal.pin}`;
                    const phone = (staffSuccessModal.phone || "").replace(/\D/g, "");
                    const msg = `👋 *${restaurantName} - Staff Shift Access*\n\nNamaste *${staffSuccessModal.name}*!\nYour staff terminal access for OrderDesk is ready:\n\n🔗 *1-Tap Shift Link*: ${loginUrl}\n👤 *Staff Name*: ${staffSuccessModal.name}\n💼 *Role*: ${staffSuccessModal.role.toUpperCase()}\n🔑 *Your PIN / Password*: ${staffSuccessModal.pin}\n\nTap the link above on your phone or tablet to start your shift immediately!`;
                    return phone
                      ? `https://api.whatsapp.com/send?phone=91${phone.length === 10 ? phone : phone}&text=${encodeURIComponent(msg)}`
                      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/40 cursor-pointer"
                >
                  <span>📲</span>
                  <span>Send Credentials on WhatsApp</span>
                </a>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const origin = typeof window !== "undefined" ? window.location.origin : "";
                      const loginUrl = `${origin}/login?resto=${restaurantId}&role=${staffSuccessModal.role}&staff=${staffSuccessModal.id}&pin=${staffSuccessModal.pin}`;
                      const text = `Staff: ${staffSuccessModal.name}\nRole: ${staffSuccessModal.role}\nPIN: ${staffSuccessModal.pin}\nShift Login: ${loginUrl}`;
                      navigator.clipboard.writeText(text);
                      setCopiedStaffLink(true);
                      setTimeout(() => setCopiedStaffLink(false), 2500);
                    }}
                    className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer border border-slate-700 text-center"
                  >
                    {copiedStaffLink ? "Copied!" : "📋 Copy Link & PIN"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setStaffSuccessModal(null)}
                    className="py-2 px-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold cursor-pointer text-center"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 5: KITCHEN DISPLAY SYSTEM DIRECT LINK */}
        {showKitchenModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🍳</span>
                  <div>
                    <h3 className="text-base font-bold text-white">Kitchen Display Rail (KDS)</h3>
                    <p className="text-[11px] text-slate-400">Permanent Station URL for Kitchen Tablet / TV</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowKitchenModal(false)}
                  className="text-slate-400 hover:text-white cursor-pointer text-lg p-1"
                >
                  ✕
                </button>
              </div>

              <div className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                💡 Open this link on your kitchen tablet or monitor. It stays logged into the Kitchen Rail display with live sound alerts, ticket timers, and mark-ready controls without requiring re-login.
              </div>

              {/* Direct Kitchen Link */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5">
                <div className="text-[10px] uppercase font-mono text-slate-400 flex justify-between">
                  <span>Kitchen Station Direct URL:</span>
                  {copiedKitchenLink && <span className="text-emerald-400 font-bold">✓ Copied</span>}
                </div>
                <div className="text-xs font-mono text-amber-300 break-all bg-black/40 p-2 rounded border border-slate-800">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/login?resto=${restaurantId}&role=kitchen`
                    : ""}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-1">
                <a
                  href={(() => {
                    const origin = typeof window !== "undefined" ? window.location.origin : "";
                    const kdsUrl = `${origin}/login?resto=${restaurantId}&role=kitchen`;
                    const msg = `🍳 *${restaurantName} - Kitchen Display Link*\n\nOpen this link on the kitchen tablet or TV screen to view live orders and kitchen tickets:\n🔗 ${kdsUrl}`;
                    return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/40 cursor-pointer"
                >
                  <span>📲</span>
                  <span>Share Kitchen Link on WhatsApp</span>
                </a>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const origin = typeof window !== "undefined" ? window.location.origin : "";
                      const kdsUrl = `${origin}/login?resto=${restaurantId}&role=kitchen`;
                      navigator.clipboard.writeText(kdsUrl);
                      setCopiedKitchenLink(true);
                      setTimeout(() => setCopiedKitchenLink(false), 2500);
                    }}
                    className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer border border-slate-700 text-center"
                  >
                    {copiedKitchenLink ? "Copied!" : "📋 Copy Kitchen Link"}
                  </button>

                  <a
                    href="/kitchen"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold cursor-pointer text-center flex items-center justify-center gap-1.5"
                  >
                    <span>Open KDS</span>
                    <span>↗</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
