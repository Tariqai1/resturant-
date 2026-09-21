"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { getTableAccessCode } from "@/lib/utils/table-code";
import ShareMenuModal from "@/components/ShareMenuModal";
import FoodChefLoader from "@/components/FoodChefLoader";

type TableData = {
  id: string;
  table_number: string;
  qr_token: string;
  status: string;
  created_at: string;
};

// 5 Luxury 5-Star Standee Themes
export const STANDEE_PRESETS = [
  {
    id: "royal-obsidian",
    name: "Royal Obsidian Gold",
    subtitle: "5-Star Luxury Fine Dining",
    bg: "#0B0F17",
    border: "#D4AF37",
    accent: "#F59E0B",
    text: "#F8FAFC",
    subtext: "#94A3B8",
    badgeBg: "rgba(212, 175, 55, 0.15)",
    qrDark: "#0B0F17",
    qrLight: "#FFFFFF",
    previewGradient: "from-[#0B0F17] to-[#1E293B]",
  },
  {
    id: "imperial-pearl",
    name: "Imperial Pearl & Wine",
    subtitle: "Regal Ivory & Rich Rosewood",
    bg: "#FAF7F2",
    border: "#881337",
    accent: "#BE123C",
    text: "#1E1B18",
    subtext: "#78716C",
    badgeBg: "rgba(190, 18, 60, 0.10)",
    qrDark: "#1E1B18",
    qrLight: "#FFFFFF",
    previewGradient: "from-[#FAF7F2] to-[#F5EBE1]",
  },
  {
    id: "heritage-emerald",
    name: "Heritage Emerald & Brass",
    subtitle: "Palace Emerald & Warm Brass",
    bg: "#022C22",
    border: "#FDE68A",
    accent: "#F59E0B",
    text: "#F0FDF4",
    subtext: "#86EFAC",
    badgeBg: "rgba(253, 230, 138, 0.15)",
    qrDark: "#022C22",
    qrLight: "#FFFFFF",
    previewGradient: "from-[#022C22] to-[#064E3B]",
  },
  {
    id: "midnight-sapphire",
    name: "Midnight Sapphire & Platinum",
    subtitle: "Executive Navy & Platinum",
    bg: "#080E1E",
    border: "#38BDF8",
    accent: "#0284C7",
    text: "#F8FAFC",
    subtext: "#94A3B8",
    badgeBg: "rgba(56, 189, 248, 0.15)",
    qrDark: "#080E1E",
    qrLight: "#FFFFFF",
    previewGradient: "from-[#080E1E] to-[#0F172A]",
  },
  {
    id: "velvet-crimson",
    name: "Velvet Crimson & Flame",
    subtitle: "Tandoori Lounge & Amber",
    bg: "#18080C",
    border: "#FB923C",
    accent: "#F97316",
    text: "#FFF1F2",
    subtext: "#FDA4AF",
    badgeBg: "rgba(251, 146, 60, 0.15)",
    qrDark: "#18080C",
    qrLight: "#FFFFFF",
    previewGradient: "from-[#18080C] to-[#2E0B14]",
  },
];

export default function TablesManagementPage() {
  const [tables, setTables] = useState<TableData[]>([]);
  const [restaurantName, setRestaurantName] = useState<string>("Order Desk");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedChit, setSelectedChit] = useState<TableData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [isAddingTable, setIsAddingTable] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copiedTableId, setCopiedTableId] = useState<string | null>(null);

  // Standee Customizer Configuration
  const [activePresetIndex, setActivePresetIndex] = useState(0);
  const [customHeading, setCustomHeading] = useState("");
  const [customSubtitle, setCustomSubtitle] = useState("Scan to order from your phone");
  const [customFooter, setCustomFooter] = useState("Fixed Acrylic Standee • Contactless Dining");
  const [customBgColor, setCustomBgColor] = useState(STANDEE_PRESETS[0].bg);
  const [customBorderColor, setCustomBorderColor] = useState(STANDEE_PRESETS[0].border);
  const [showSteps, setShowSteps] = useState(true);
  const [showPasscode, setShowPasscode] = useState(true);
  const [showWifi, setShowWifi] = useState(false);
  const [wifiPassword, setWifiPassword] = useState("Guest@123");

  const printFrameRef = useRef<HTMLDivElement>(null);

  // Quick Copy
  function handleQuickCopyLink(table: TableData) {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const url = `${origin}/table/${table.qr_token}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(15);
    }
    setCopiedTableId(table.id);
    setTimeout(() => setCopiedTableId(null), 2500);
  }

  // Quick WhatsApp
  function handleQuickWhatsApp(table: TableData) {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const url = `${origin}/table/${table.qr_token}`;
    const text = `🍽️ *${restaurantName || "Order Desk"}* - Table ${table.table_number}\n\nLive Customer Menu & Direct Ordering:\n🔗 ${url}\n\n✨ Instant kitchen service & live cooking tracker!`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function refreshTables() {
    try {
      const res = await fetch("/api/tables");
      const data = await res.json();
      if (res.ok) {
        setTables(data.tables || []);
        if (data.restaurant?.name) setRestaurantName(data.restaurant.name);
      }
    } catch {
      // Keep running state
    }
  }

  useEffect(() => {
    let isMounted = true;
    fetch("/api/tables")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setTables(data.tables || []);
        if (data.restaurant?.name) setRestaurantName(data.restaurant.name);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setErrorMessage(err instanceof Error ? err.message : "Error loading tables");
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Generate QR with proper high-res contrast
  async function openChitModal(table: TableData) {
    setSelectedChit(table);
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const tableUrl = `${origin}/table/${table.qr_token}`;
    try {
      const currentPreset = STANDEE_PRESETS[activePresetIndex] || STANDEE_PRESETS[0];
      const url = await QRCode.toDataURL(tableUrl, {
        width: 480,
        margin: 2,
        color: {
          dark: currentPreset.qrDark,
          light: currentPreset.qrLight,
        },
      });
      setQrDataUrl(url);
    } catch (e) {
      console.error("QR render error:", e);
    }
  }

  // When theme changes, regenerate QR code colors
  async function applyPreset(index: number) {
    setActivePresetIndex(index);
    const p = STANDEE_PRESETS[index];
    setCustomBgColor(p.bg);
    setCustomBorderColor(p.border);

    if (selectedChit) {
      const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      const tableUrl = `${origin}/table/${selectedChit.qr_token}`;
      try {
        const url = await QRCode.toDataURL(tableUrl, {
          width: 480,
          margin: 2,
          color: {
            dark: p.qrDark,
            light: p.qrLight,
          },
        });
        setQrDataUrl(url);
      } catch (e) {
        console.error("QR render error:", e);
      }
    }
  }

  async function handleAddTable(e: React.FormEvent) {
    e.preventDefault();
    if (!newTableNumber.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNumber: newTableNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create table");
      setNewTableNumber("");
      setIsAddingTable(false);
      await refreshTables();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add table");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegenerateToken(tableId: string) {
    if (!confirm("Regenerating the QR code will invalidate any existing printed table standees. Continue?")) {
      return;
    }
    try {
      const res = await fetch("/api/tables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId, action: "regenerate_token" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to regenerate token");
      await refreshTables();
      if (selectedChit && selectedChit.id === tableId) {
        await openChitModal(data.table);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to regenerate token");
    }
  }

  function getStatusStyle(status: string) {
    switch (status) {
      case "served":
        return { border: "border-t-[3px] border-t-emerald-500", text: "Dining", bg: "bg-emerald-950/40 text-emerald-300 border-emerald-800/60" };
      case "preparing":
        return { border: "border-t-[3px] border-t-sky-500", text: "Cooking", bg: "bg-sky-950/40 text-sky-300 border-sky-800/60" };
      case "pending":
        return { border: "border-t-[3px] border-t-amber-500", text: "New Order", bg: "bg-amber-950/40 text-amber-300 border-amber-800/60" };
      case "payment_pending":
        return { border: "border-t-[3px] border-t-rose-500", text: "Bill Ready", bg: "bg-rose-950/40 text-rose-300 border-rose-800/60" };
      default:
        return { border: "border-t-[3px] border-t-slate-700", text: "Available", bg: "bg-slate-800/60 text-slate-400 border-slate-700" };
    }
  }

  const activePreset = STANDEE_PRESETS[activePresetIndex] || STANDEE_PRESETS[0];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-950 text-slate-100 antialiased selection:bg-amber-500 selection:text-black">
      {/* Print-Only CSS Stylesheet */}
      <style jsx global>{`
        @media print {
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            height: 100% !important;
          }
          /* Hide everything except printable standee */
          body * {
            visibility: hidden !important;
          }
          #printable-standee-card,
          #printable-standee-card * {
            visibility: visible !important;
          }
          #printable-standee-card {
            position: fixed !important;
            left: 50% !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 105mm !important;
            max-width: 105mm !important;
            box-shadow: none !important;
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Dark Sidebar */}
      <aside className="w-full md:w-64 flex-shrink-0 flex flex-col justify-between p-5 bg-slate-900/80 border-r border-slate-800/80 backdrop-blur-xl">
        <div>
          {/* Brand Header */}
          <div className="flex items-center justify-between mb-8 pb-5 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🍽️</span>
                <h1 className="font-extrabold text-lg tracking-tight text-white bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 bg-clip-text text-transparent">
                  Order Desk
                </h1>
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate max-w-[190px] mt-0.5">
                {restaurantName}
              </p>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-amber-950/60 border border-amber-700/50 text-amber-400 rounded font-semibold">
              POS
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5 text-xs font-semibold">
            <Link
              href="/"
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <span>📊</span>
              <span>Floor Overview</span>
            </Link>

            <Link
              href="/tables"
              className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-600/10 border border-amber-500/40 text-amber-300 font-bold shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <span>🪑</span>
                <span>Floor Layout &amp; QR</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30">
                {tables.length} tables
              </span>
            </Link>

            <Link
              href="/kitchen"
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <span>👨‍🍳</span>
              <span>Kitchen Rail (KDS)</span>
            </Link>

            <Link
              href="/menu"
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <span>📖</span>
              <span>Menu &amp; Stock</span>
            </Link>

            <Link
              href="/staff"
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <span>👥</span>
              <span>Staff &amp; Access</span>
            </Link>
          </nav>
        </div>

        {/* Back Link */}
        <div className="pt-4 border-t border-slate-800/80">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-amber-400 transition-colors"
          >
            <span>←</span>
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="flex-1 p-5 md:p-8 overflow-y-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-white tracking-tight">
                Table Fleet &amp; 5-Star QR Standees
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                {tables.length} tables
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Manage physical restaurant tables, live ordering status, and generate 5-Star acrylic print standees.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              className="px-4 py-2 text-xs font-bold rounded-xl border border-emerald-800/60 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <span>📤</span>
              <span>Share Live Menu QR</span>
            </button>
            <button
              onClick={() => setIsAddingTable(true)}
              className="px-4 py-2 text-xs font-bold text-slate-950 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span className="text-base leading-none">+</span>
              <span>Add Table Station</span>
            </button>
          </div>
        </header>

        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs font-semibold">
            ⚠️ {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl">
            <FoodChefLoader message="Loading Table Floor..." subMessage="Fetching active table chits & QR tokens..." />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300">{tables.length} configured table stations</span>
              <span>Tap any table card to customize &amp; print its 5-Star Standee</span>
            </div>

            {/* Grid of Table Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {tables.map((table) => {
                const style = getStatusStyle(table.status);
                return (
                  <div
                    key={table.id}
                    onClick={() => openChitModal(table)}
                    className={`min-h-[130px] p-4 rounded-2xl text-left flex flex-col justify-between cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] bg-slate-900/60 border border-slate-800/90 shadow-md hover:border-amber-500/50 ${style.border}`}
                  >
                    <div className="flex items-baseline justify-between">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-white font-mono">
                          {table.table_number}
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${style.bg}`}>
                        {style.text}
                      </span>
                    </div>

                    <div className="pt-3 mt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-500">
                        QR: {table.qr_token.slice(0, 8)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickCopyLink(table);
                          }}
                          className="text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          title="Copy table menu URL"
                        >
                          {copiedTableId === table.id ? "✓" : "🔗"}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickWhatsApp(table);
                          }}
                          className="text-[10px] font-bold px-2 py-1 rounded-lg border border-emerald-800/60 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 transition-colors cursor-pointer"
                          title="Share on WhatsApp"
                        >
                          💬
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* 5-STAR STANDEE CUSTOMIZER & PRINT MODAL                     */}
        {/* ============================================================ */}
        {selectedChit && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto"
            onClick={() => setSelectedChit(null)}
          >
            <div
              className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-5 sm:p-7 text-slate-100 animate-in fade-in zoom-in-95 max-h-[95vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Top Bar */}
              <div className="flex justify-between items-start pb-4 mb-5 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🏆</span>
                    <h3 className="text-lg font-black text-white">5-Star Table Standee Studio</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Table {selectedChit.table_number}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Customize colors, heading, and print executive acrylic table standees.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedChit(null)}
                  className="text-slate-400 hover:text-white text-xl font-bold cursor-pointer p-1"
                >
                  ✕
                </button>
              </div>

              {/* 2-Column Layout: Standee Live Card (Left) + Customizer Panel (Right) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* LEFT: Live Standee Preview (A6 Table Tent Proportions) */}
                <div className="lg:col-span-6 flex flex-col items-center">
                  <div className="text-[11px] font-mono text-slate-400 mb-2 flex items-center gap-1.5">
                    <span>📐</span>
                    <span>Live Physical Standee Preview (A6 / 4×6 inch)</span>
                  </div>

                  {/* Physical Standee Card with Luxury Framing */}
                  <div
                    id="printable-standee-card"
                    ref={printFrameRef}
                    className="w-full max-w-[320px] rounded-2xl p-6 text-center shadow-2xl transition-all relative overflow-hidden select-none border-2"
                    style={{
                      backgroundColor: customBgColor || activePreset.bg,
                      borderColor: customBorderColor || activePreset.border,
                      color: activePreset.text,
                    }}
                  >
                    {/* Corner Brass Accents */}
                    <div
                      className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2"
                      style={{ borderColor: customBorderColor || activePreset.border }}
                    />
                    <div
                      className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2"
                      style={{ borderColor: customBorderColor || activePreset.border }}
                    />
                    <div
                      className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2"
                      style={{ borderColor: customBorderColor || activePreset.border }}
                    />
                    <div
                      className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2"
                      style={{ borderColor: customBorderColor || activePreset.border }}
                    />

                    {/* Top Royal Emblem */}
                    <div
                      className="text-xs font-black tracking-widest uppercase mb-1 flex items-center justify-center gap-1.5"
                      style={{ color: customBorderColor || activePreset.accent }}
                    >
                      <span>✦</span>
                      <span>Fine Dining Experience</span>
                      <span>✦</span>
                    </div>

                    {/* Restaurant Name */}
                    <h2
                      className="text-xl font-black tracking-tight uppercase"
                      style={{ color: activePreset.text }}
                    >
                      {customHeading || restaurantName}
                    </h2>

                    {/* Subtitle */}
                    <p
                      className="text-[11px] font-medium mt-0.5"
                      style={{ color: activePreset.subtext }}
                    >
                      {customSubtitle}
                    </p>

                    {/* Table Pill Badge */}
                    <div className="my-3 flex justify-center">
                      <div
                        className="inline-flex items-center gap-2 px-4 py-1 rounded-full border text-xs font-black tracking-widest font-mono shadow-xs"
                        style={{
                          backgroundColor: activePreset.badgeBg,
                          borderColor: customBorderColor || activePreset.border,
                          color: customBorderColor || activePreset.accent,
                        }}
                      >
                        <span>✦</span>
                        <span>TABLE {selectedChit.table_number}</span>
                        <span>✦</span>
                      </div>
                    </div>

                    {/* QR Code Container */}
                    {qrDataUrl && (
                      <div className="flex justify-center my-3">
                        <div
                          className="p-2.5 rounded-2xl bg-white shadow-xl border-2"
                          style={{ borderColor: customBorderColor || activePreset.border }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={qrDataUrl}
                            alt={`QR Code for Table ${selectedChit.table_number}`}
                            className="w-44 h-44 rounded-xl object-contain"
                          />
                        </div>
                      </div>
                    )}

                    {/* 3-Step Ordering Micro Guide */}
                    {showSteps && (
                      <div
                        className="my-3 py-2 px-2.5 rounded-xl border flex items-center justify-around text-[10px] font-bold"
                        style={{
                          backgroundColor: activePreset.badgeBg,
                          borderColor: `${customBorderColor}40` || `${activePreset.border}40`,
                          color: activePreset.text,
                        }}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span>📱</span>
                          <span>1. Scan QR</span>
                        </div>
                        <span style={{ color: customBorderColor }}>→</span>
                        <div className="flex flex-col items-center gap-0.5">
                          <span>🍲</span>
                          <span>2. Order</span>
                        </div>
                        <span style={{ color: customBorderColor }}>→</span>
                        <div className="flex flex-col items-center gap-0.5">
                          <span>💳</span>
                          <span>3. Pay at Table</span>
                        </div>
                      </div>
                    )}

                    {/* Passcode Backup Banner */}
                    {showPasscode && (
                      <div
                        className="my-2 py-1.5 px-3 rounded-lg border text-center text-[10px]"
                        style={{
                          backgroundColor: "rgba(0, 0, 0, 0.25)",
                          borderColor: `${customBorderColor}30` || `${activePreset.border}30`,
                          color: activePreset.subtext,
                        }}
                      >
                        <div>Camera not scanning? Go to <strong style={{ color: activePreset.text }}>orderdesk.in/enter</strong></div>
                        <div className="mt-0.5 font-mono font-bold tracking-widest text-xs" style={{ color: customBorderColor || activePreset.accent }}>
                          PASSCODE: {getTableAccessCode(selectedChit.qr_token)}
                        </div>
                      </div>
                    )}

                    {/* Wi-Fi note (if enabled) */}
                    {showWifi && (
                      <div className="text-[10px] font-mono mt-1" style={{ color: activePreset.subtext }}>
                        📶 Guest Wi-Fi: <strong style={{ color: activePreset.text }}>{wifiPassword}</strong>
                      </div>
                    )}

                    {/* Footer Note */}
                    <div
                      className="text-[9px] font-mono mt-2 uppercase tracking-wider"
                      style={{ color: activePreset.subtext }}
                    >
                      {customFooter}
                    </div>
                  </div>
                </div>

                {/* RIGHT: Customizer Studio Controls */}
                <div className="lg:col-span-6 space-y-4 text-xs">
                  {/* Option 1: 5 Preset Luxury Themes */}
                  <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-2.5">
                    <label className="block text-slate-300 font-bold flex items-center justify-between">
                      <span>1. Choose Luxury Preset (5 Options)</span>
                      <span className="text-[10px] text-amber-400 font-mono">
                        {activePreset.name} {activePresetIndex === 0 ? "(Default)" : ""}
                      </span>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {STANDEE_PRESETS.map((preset, idx) => {
                        const isSelected = activePresetIndex === idx;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => applyPreset(idx)}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                              isSelected
                                ? "bg-slate-800 border-amber-500 shadow-md ring-1 ring-amber-500"
                                : "bg-slate-900 border-slate-800 hover:border-slate-700"
                            }`}
                          >
                            {/* Color Preview Swatch */}
                            <div
                              className="w-7 h-7 rounded-lg shrink-0 border flex items-center justify-center text-xs font-black shadow-inner"
                              style={{
                                backgroundColor: preset.bg,
                                borderColor: preset.border,
                                color: preset.border,
                              }}
                            >
                              ✦
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-white text-[11px] truncate flex items-center gap-1">
                                <span>{preset.name}</span>
                                {idx === 0 && (
                                  <span className="text-[8px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded font-mono">
                                    Default
                                  </span>
                                )}
                              </div>
                              <div className="text-[9px] text-slate-400 truncate">
                                {preset.subtitle}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Option 2: Custom Colors */}
                  <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-2.5">
                    <span className="block text-slate-300 font-bold">2. Custom Restaurant Colors</span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Card Background</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={customBgColor}
                            onChange={(e) => setCustomBgColor(e.target.value)}
                            className="w-8 h-8 rounded-lg border border-slate-700 bg-transparent cursor-pointer"
                          />
                          <input
                            type="text"
                            value={customBgColor}
                            onChange={(e) => setCustomBgColor(e.target.value)}
                            className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono text-[11px]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Border &amp; Gold Accent</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={customBorderColor}
                            onChange={(e) => setCustomBorderColor(e.target.value)}
                            className="w-8 h-8 rounded-lg border border-slate-700 bg-transparent cursor-pointer"
                          />
                          <input
                            type="text"
                            value={customBorderColor}
                            onChange={(e) => setCustomBorderColor(e.target.value)}
                            className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono text-[11px]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Option 3: Custom Text Fields */}
                  <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                    <span className="block text-slate-300 font-bold">3. Custom Restaurant Text</span>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-0.5">Restaurant Header Name</label>
                      <input
                        type="text"
                        placeholder={restaurantName}
                        value={customHeading}
                        onChange={(e) => setCustomHeading(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-semibold text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-0.5">Subtitle / Tagline</label>
                      <input
                        type="text"
                        value={customSubtitle}
                        onChange={(e) => setCustomSubtitle(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-medium text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-0.5">Footer Note</label>
                      <input
                        type="text"
                        value={customFooter}
                        onChange={(e) => setCustomFooter(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-medium text-xs"
                      />
                    </div>
                  </div>

                  {/* Option 4: Display Toggles */}
                  <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-2">
                    <span className="block text-slate-300 font-bold">4. Standee Elements</span>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                        <input
                          type="checkbox"
                          checked={showSteps}
                          onChange={(e) => setShowSteps(e.target.checked)}
                          className="w-4 h-4 rounded accent-amber-500"
                        />
                        <span>Show 3-Step Guide</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                        <input
                          type="checkbox"
                          checked={showPasscode}
                          onChange={(e) => setShowPasscode(e.target.checked)}
                          className="w-4 h-4 rounded accent-amber-500"
                        />
                        <span>Show Passcode Card</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg bg-slate-900 border border-slate-800 col-span-2">
                        <input
                          type="checkbox"
                          checked={showWifi}
                          onChange={(e) => setShowWifi(e.target.checked)}
                          className="w-4 h-4 rounded accent-amber-500"
                        />
                        <span>Show Wi-Fi Password</span>
                      </label>
                    </div>

                    {showWifi && (
                      <input
                        type="text"
                        placeholder="e.g. Cafe@WiFi2026"
                        value={wifiPassword}
                        onChange={(e) => setWifiPassword(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono text-xs"
                      />
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2 pt-2">
                    {/* Primary Print Button */}
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="w-full py-3 px-4 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-xl shadow-amber-500/25 cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-95 text-xs uppercase tracking-wider"
                    >
                      <span className="text-base">🖨️</span>
                      <span>Print 5-Star Table Standee</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuickCopyLink(selectedChit)}
                        className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-700 shadow-xs"
                      >
                        <span>{copiedTableId === selectedChit.id ? "✓" : "📋"}</span>
                        <span>{copiedTableId === selectedChit.id ? "Copied Link!" : "Copy Link"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickWhatsApp(selectedChit)}
                        className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-emerald-950/40"
                      >
                        <span>💬</span>
                        <span>Send WhatsApp</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
                          window.open(`${origin}/table/${selectedChit.qr_token}`, "_blank");
                        }}
                        className="py-2 px-3 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-800 text-[11px]"
                      >
                        <span>👁️</span>
                        <span>Preview Menu</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRegenerateToken(selectedChit.id)}
                        className="py-2 px-3 bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 hover:text-rose-200 rounded-xl font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-rose-800/50 text-[11px]"
                      >
                        <span>🔄</span>
                        <span>Regenerate QR</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Add Table Station */}
        {isAddingTable && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
            onClick={() => setIsAddingTable(false)}
          >
            <div
              className="w-full max-w-xs p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start pb-2 border-b border-slate-800">
                <h3 className="text-base font-black text-white">Add Table Station</h3>
                <button
                  type="button"
                  onClick={() => setIsAddingTable(false)}
                  className="text-slate-400 hover:text-white font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleAddTable} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Table Identifier *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. T07 or Rooftop-01"
                    value={newTableNumber}
                    onChange={(e) => setNewTableNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingTable(false)}
                    className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !newTableNumber.trim()}
                    className="px-4 py-2 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 disabled:opacity-50"
                  >
                    {isSubmitting ? "Creating..." : "Create Table"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Share Live Digital Menu Modal */}
      <ShareMenuModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        restaurantName={restaurantName}
        tables={tables}
      />
    </div>
  );
}
