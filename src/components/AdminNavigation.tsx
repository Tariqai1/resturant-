"use client";

import { useState } from "react";
import Link from "next/link";

export type AdminNavigationProps = {
  currentTab: "floor" | "tables" | "kitchen" | "menu" | "staff";
  restaurantName?: string;
  currentUser?: { name?: string; role?: string } | null;
  occupiedTablesCount?: number;
  totalTablesCount?: number;
  pendingKitchenCount?: number;
  totalMenuItemsCount?: number;
  staffMembersCount?: number;
  isSuperAdmin?: boolean;
  theme?: "amber" | "crimson";
  onToggleTheme?: (newTheme: "amber" | "crimson") => void;
  onSignOut?: () => void;
  mobileNavStyle?: "bottom_bar" | "sidebar";
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

export default function AdminNavigation({
  currentTab,
  restaurantName = "Order Desk",
  currentUser,
  occupiedTablesCount = 0,
  totalTablesCount,
  pendingKitchenCount = 0,
  totalMenuItemsCount,
  staffMembersCount,
  isSuperAdmin = false,
  theme = "amber",
  onToggleTheme,
  onSignOut,
  mobileNavStyle = "bottom_bar",
}: AdminNavigationProps) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const userRole = currentUser?.role?.toLowerCase() || "";
  const isOwnerOrManager =
    Boolean(isSuperAdmin) ||
    ["owner", "manager", "admin"].includes(userRole);

  const navItems = [
    {
      key: "floor",
      label: "Floor Overview",
      shortLabel: "Floor",
      href: "/",
      icon: "📊",
      badge: occupiedTablesCount > 0 ? `${occupiedTablesCount} active` : null,
      badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    },
    ...(isOwnerOrManager
      ? [
          {
            key: "tables",
            label: "Floor Layout & QR",
            shortLabel: "Tables",
            href: "/tables",
            icon: "🪑",
            badge: totalTablesCount !== undefined ? `${totalTablesCount} tables` : null,
            badgeColor: "bg-stone-800 text-stone-300 border-stone-700",
          },
        ]
      : []),
    {
      key: "kitchen",
      label: "Kitchen Rail (KDS)",
      shortLabel: "Kitchen",
      href: "/kitchen",
      icon: "👨‍🍳",
      badge: pendingKitchenCount > 0 ? `${pendingKitchenCount} pending` : null,
      badgeColor: "bg-red-500/20 text-red-300 border-red-500/40",
    },
    ...(isOwnerOrManager
      ? [
          {
            key: "menu",
            label: "Menu & Stock",
            shortLabel: "Menu",
            href: "/menu",
            icon: "📖",
            badge: totalMenuItemsCount !== undefined ? `${totalMenuItemsCount}` : null,
            badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
          },
          {
            key: "staff",
            label: "Staff & Roles",
            shortLabel: "Staff",
            href: "/staff",
            icon: "👥",
            badge: staffMembersCount !== undefined ? `${staffMembersCount}` : null,
            badgeColor: "bg-stone-800 text-stone-300 border-stone-700",
          },
        ]
      : []),
  ];

  const handleNavClick = () => {
    triggerHaptic(10);
    setMobileDrawerOpen(false);
  };

  const handleSignOutClick = () => {
    if (onSignOut) {
      onSignOut();
    } else {
      fetch("/api/auth/logout", { method: "POST" })
        .then(() => {
          window.location.href = "/login";
        })
        .catch(() => {
          window.location.href = "/login";
        });
    }
  };

  return (
    <>
      {/* ============================================================ */}
      {/* 1. DESKTOP CAST-IRON SIDEBAR (Screen width >= md: 768px)    */}
      {/* ============================================================ */}
      <aside
        className="hidden md:flex w-60 lg:w-64 flex-shrink-0 flex-col justify-between p-5 select-none"
        style={{
          backgroundColor: "var(--dark-surface, #14110D)",
          borderRight: "1px solid rgba(220, 209, 183, 0.15)",
          color: "#FAF6EC",
        }}
      >
        <div>
          {/* Restaurant Brand Header */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-800/80">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🍽️</span>
                <h1 className="font-heading text-xl font-bold tracking-wide text-white">
                  Order Desk
                </h1>
              </div>
              <p className="text-xs truncate max-w-[170px] mt-0.5 text-stone-400">
                {restaurantName}
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
              POS
            </span>
          </div>

          {/* Restaurant Theme Switcher */}
          {onToggleTheme && (
            <div className="mb-5 p-2 rounded-xl bg-stone-900/80 border border-stone-800/80">
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5 flex items-center justify-between">
                <span>Brand Theme</span>
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold"
                  style={{
                    backgroundColor: theme === "amber" ? "#FFBE0B" : "#741A2F",
                    color: theme === "amber" ? "#2A2312" : "#FFFFFF",
                  }}
                >
                  {theme === "amber" ? "Amber Gold" : "Velvet Crimson"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggleTheme("amber")}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    theme === "amber"
                      ? "bg-amber-400/20 text-amber-300 border border-amber-400/50 shadow-xs"
                      : "text-stone-400 hover:text-stone-200 border border-transparent"
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FFBE0B] shrink-0 border border-stone-900 shadow-sm" />
                  <span className="truncate">Amber</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleTheme("crimson")}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    theme === "crimson"
                      ? "bg-rose-950/60 text-rose-300 border border-rose-600/50 shadow-xs"
                      : "text-stone-400 hover:text-stone-200 border border-transparent"
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[#741A2F] shrink-0 border border-rose-300/40 shadow-sm" />
                  <span className="truncate">Crimson</span>
                </button>
              </div>
            </div>
          )}

          {/* Navigation Links */}
          <nav className="space-y-1 text-xs font-semibold">
            {navItems.map((item) => {
              const isActive = currentTab === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={handleNavClick}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all ${
                    isActive
                      ? "bg-gradient-to-r from-amber-500/20 to-amber-600/10 border border-amber-500/40 text-amber-300 font-bold shadow-xs"
                      : "text-stone-400 hover:text-white hover:bg-stone-900/80 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span>{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                        isActive ? "bg-amber-500/20 text-amber-200 border-amber-500/30" : item.badgeColor
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}

            {/* Super Admin Platform Link */}
            {isSuperAdmin && (
              <Link
                href="/super-admin"
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl transition-colors border border-amber-800/40 bg-amber-950/20 text-amber-300 text-xs font-bold mt-2"
              >
                <span>⚡</span>
                <span>Super Admin Platform</span>
              </Link>
            )}
          </nav>
        </div>

        {/* Station User & Sign Out Footer */}
        <div className="pt-4 border-t border-stone-800">
          <div className="flex items-center justify-between text-xs">
            <div className="truncate pr-2">
              <div className="font-bold text-white truncate">
                {currentUser?.name || "Floor Staff"}
              </div>
              <div className="text-[11px] capitalize text-stone-400">
                {currentUser?.role || "Staff"}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOutClick}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold hover:bg-stone-800 text-stone-400 hover:text-white cursor-pointer transition-colors shrink-0"
              title="Sign out of station"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* 2. MOBILE TOP NAVBAR (Screen width < md: 768px)             */}
      {/* ============================================================ */}
      <header className="md:hidden sticky top-0 z-30 px-4 py-2.5 bg-[#14110D]/95 border-b border-stone-800/80 backdrop-blur-md flex items-center justify-between select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-sm font-black text-amber-400 shrink-0">
            OD
          </div>
          <div className="min-w-0">
            <h1 className="font-heading text-sm font-black tracking-tight text-white leading-tight truncate">
              {restaurantName}
            </h1>
            <div className="flex items-center gap-1.5 text-[10px] text-stone-400 font-medium">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>POS Live</span>
              {occupiedTablesCount > 0 && (
                <span className="text-amber-400 font-mono">· {occupiedTablesCount} active</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Theme Quick Switcher */}
          {onToggleTheme && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic(8);
                onToggleTheme(theme === "amber" ? "crimson" : "amber");
              }}
              title="Switch Brand Theme"
              className="w-7 h-7 rounded-full border flex items-center justify-center text-xs cursor-pointer active:scale-95 shadow-xs"
              style={{
                backgroundColor: theme === "amber" ? "#2A2312" : "#741A2F",
                borderColor: theme === "amber" ? "#FFBE0B" : "#FFC6A8",
              }}
            >
              <span>{theme === "amber" ? "👑" : "✨"}</span>
            </button>
          )}

          {/* Profile & Sign-Out Avatar Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="w-7 h-7 rounded-full bg-stone-800 hover:bg-stone-700 border border-stone-700 text-white flex items-center justify-center text-[11px] font-bold cursor-pointer"
            >
              {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
            </button>

            {profileDropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-48 rounded-xl bg-[#1C1712] border border-stone-800 shadow-2xl p-3 z-50 text-xs space-y-2 animate-in fade-in zoom-in-95 duration-150"
                onClick={() => setProfileDropdownOpen(false)}
              >
                <div className="border-b border-stone-800 pb-2">
                  <div className="font-bold text-white truncate">
                    {currentUser?.name || "Floor Staff"}
                  </div>
                  <div className="text-[10px] text-stone-400 capitalize">
                    {currentUser?.role || "Staff"} · {restaurantName}
                  </div>
                </div>

                {isSuperAdmin && (
                  <Link
                    href="/super-admin"
                    className="block px-2 py-1.5 rounded-lg text-amber-300 hover:bg-white/5 font-bold"
                  >
                    ⚡ Super Admin Platform
                  </Link>
                )}

                <button
                  type="button"
                  onClick={handleSignOutClick}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-red-400 hover:bg-red-950/40 font-bold cursor-pointer transition-colors"
                >
                  🚪 Sign Out
                </button>
              </div>
            )}
          </div>

          {/* Hamburger Icon only if mobileNavStyle is 'sidebar' */}
          {mobileNavStyle === "sidebar" && (
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="p-1.5 rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 cursor-pointer"
              title="Open menu"
            >
              ☰
            </button>
          )}
        </div>
      </header>

      {/* ============================================================ */}
      {/* 3. MOBILE BOTTOM NAVIGATION BAR (1-Thumb Touch Bar)          */}
      {/* ============================================================ */}
      {mobileNavStyle === "bottom_bar" && (
        <nav
          aria-label="Mobile Bottom Navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#14110D]/95 border-t border-stone-800/90 backdrop-blur-xl px-1 py-1.5 flex items-center justify-around shadow-2xl select-none"
        >
          {navItems.map((item) => {
            const isActive = currentTab === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={handleNavClick}
                className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer active:scale-95 ${
                  isActive
                    ? "text-amber-400 font-bold"
                    : "text-stone-400 hover:text-stone-200"
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <span className={`text-lg transition-transform ${isActive ? "scale-110" : ""}`}>
                    {item.icon}
                  </span>
                  {/* Micro indicator badge for pending items / active tables */}
                  {item.key === "kitchen" && pendingKitchenCount > 0 && (
                    <span className="absolute -top-1 -right-2.5 w-4 h-4 rounded-full bg-red-600 text-white font-mono text-[9px] font-black flex items-center justify-center animate-pulse">
                      {pendingKitchenCount > 9 ? "9+" : pendingKitchenCount}
                    </span>
                  )}
                  {item.key === "floor" && occupiedTablesCount > 0 && (
                    <span className="absolute -top-1 -right-2 w-2 h-2 rounded-full bg-emerald-500" />
                  )}
                </div>
                <span
                  className={`text-[10px] tracking-tight mt-0.5 leading-none ${
                    isActive ? "font-black text-amber-400" : "font-medium text-stone-400"
                  }`}
                >
                  {item.shortLabel}
                </span>
                {isActive && (
                  <span className="w-1 h-1 rounded-full bg-amber-400 mt-0.5 animate-in zoom-in" />
                )}
              </Link>
            );
          })}
        </nav>
      )}

      {/* ============================================================ */}
      {/* 4. MOBILE SLIDE-OUT DRAWER (If mobileNavStyle === 'sidebar')  */}
      {/* ============================================================ */}
      {mobileDrawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex animate-in fade-in duration-200"
          onClick={() => setMobileDrawerOpen(false)}
        >
          <div
            className="w-72 max-w-[80vw] h-full bg-[#14110D] border-r border-stone-800 p-5 flex flex-col justify-between animate-in slide-in-from-left duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-stone-800">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🍽️</span>
                  <div>
                    <h2 className="font-heading text-base font-bold text-white">Order Desk</h2>
                    <p className="text-xs text-stone-400 truncate max-w-[160px]">{restaurantName}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="w-8 h-8 rounded-lg bg-stone-900 text-stone-400 flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              </div>

              <nav className="mt-4 space-y-1.5 text-xs font-semibold">
                {navItems.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={handleNavClick}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all ${
                      currentTab === item.key
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold"
                        : "text-stone-300 hover:text-white hover:bg-stone-900"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700 text-stone-300">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                ))}

                {isSuperAdmin && (
                  <Link
                    href="/super-admin"
                    onClick={handleNavClick}
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-amber-800/40 bg-amber-950/20 text-amber-300 text-xs font-bold mt-2"
                  >
                    <span>⚡</span>
                    <span>Super Admin Platform</span>
                  </Link>
                )}
              </nav>
            </div>

            <div className="pt-4 border-t border-stone-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">{currentUser?.name || "Staff"}</div>
                <div className="text-[10px] text-stone-400 capitalize">{currentUser?.role || "Staff"}</div>
              </div>
              <button
                type="button"
                onClick={handleSignOutClick}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-stone-900 hover:bg-stone-800 text-red-400 cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
