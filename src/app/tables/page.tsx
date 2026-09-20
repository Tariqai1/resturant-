"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { getTableAccessCode } from "@/lib/utils/table-code";
import ShareMenuModal from "@/components/ShareMenuModal";

type TableData = {
  id: string;
  table_number: string;
  qr_token: string;
  status: string;
  created_at: string;
};

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

  function handleQuickWhatsApp(table: TableData) {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const url = `${origin}/table/${table.qr_token}`;
    const text = `🍽️ *${restaurantName || "Order Desk"}* - Table ${table.table_number}\n\nLive Customer Menu & Direct Ordering:\n🔗 ${url}\n\n✨ Instant kitchen service & live cooking tracker!`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  }
  const printFrameRef = useRef<HTMLDivElement>(null);

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

  async function openChitModal(table: TableData) {
    setSelectedChit(table);
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const tableUrl = `${origin}/table/${table.qr_token}`;
    try {
      const url = await QRCode.toDataURL(tableUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: "#2A241C",
          light: "#FAF6EC",
        },
      });
      setQrDataUrl(url);
    } catch (e) {
      console.error("QR render error:", e);
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
    if (!confirm("Regenerating the QR code will invalidate any existing printed table chits. Continue?")) {
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
        return { border: "border-t-[3px] border-t-[#5B7A55]", text: "Seated & Dining", color: "text-[#5B7A55]" };
      case "preparing":
        return { border: "border-t-[3px] border-t-[#3C5A72]", text: "Kitchen Cooking", color: "text-[#3C5A72]" };
      case "pending":
        return { border: "border-t-[3px] border-t-[#C1652C]", text: "New Order Placed", color: "text-[#C1652C]" };
      case "payment_pending":
        return { border: "border-t-[3px] border-t-[#A8412F]", text: "Bill Requested", color: "text-[#A8412F]" };
      default:
        return { border: "border-t-[3px] border-t-[#DCD1B7]", text: "Empty & Free", color: "text-[#6B6153]" };
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ backgroundColor: "var(--paper)" }}>
      {/* Dark Sidebar */}
      <aside
        className="w-full md:w-60 flex-shrink-0 flex flex-col justify-between p-5"
        style={{
          backgroundColor: "var(--dark-surface)",
          borderRight: "1px solid rgba(220, 209, 183, 0.15)",
          color: "#FAF6EC",
        }}
      >
        <div>
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-stone-800">
            <div>
              <h1 className="font-heading text-xl font-bold tracking-wide" style={{ color: "#FAF6EC" }}>
                Order Desk
              </h1>
              <p className="text-xs truncate max-w-[170px]" style={{ color: "#9E9382" }}>
                {restaurantName}
              </p>
            </div>
          </div>

          <nav className="space-y-1 text-xs font-medium">
            <Link
              href="/"
              className="flex items-center px-3 py-2 rounded transition-colors hover:bg-stone-900"
              style={{ color: "#D1C7B7" }}
            >
              <span>Floor overview</span>
            </Link>

            <Link
              href="/tables"
              className="flex items-center justify-between px-3 py-2 rounded font-semibold transition-colors"
              style={{
                backgroundColor: "rgba(193, 101, 44, 0.18)",
                color: "var(--rust)",
                border: "1px solid rgba(193, 101, 44, 0.35)",
              }}
            >
              <span>Floor layout</span>
              <span className="font-receipt text-[11px] font-bold">{tables.length} tables</span>
            </Link>

            <Link
              href="/kitchen"
              className="flex items-center px-3 py-2 rounded transition-colors hover:bg-stone-900"
              style={{ color: "#D1C7B7" }}
            >
              <span>Kitchen rail</span>
            </Link>

            <Link
              href="/menu"
              className="flex items-center px-3 py-2 rounded transition-colors hover:bg-stone-900"
              style={{ color: "#D1C7B7" }}
            >
              <span>Menu and stock</span>
            </Link>

            <Link
              href="/staff"
              className="flex items-center px-3 py-2 rounded transition-colors hover:bg-stone-900"
              style={{ color: "#D1C7B7" }}
            >
              <span>Staff and roles</span>
            </Link>
          </nav>
        </div>

        <div className="pt-4 border-t border-stone-800">
          <Link
            href="/"
            className="block text-xs font-medium hover:underline"
            style={{ color: "#9E9382" }}
          >
            Back to dashboard
          </Link>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="flex-1 p-5 md:p-8 overflow-y-auto space-y-6" style={{ backgroundColor: "var(--paper)" }}>
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-dashed" style={{ borderColor: "var(--hairline)" }}>
          <div>
            <h2 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
              Table Stations &amp; QR Slips
            </h2>
            <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
              Manage physical tables and customer QR order slips for {restaurantName}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              className="px-3.5 py-2 text-xs font-bold rounded cursor-pointer border flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
              style={{
                backgroundColor: "#E8F5E9",
                color: "#1B5E20",
                borderColor: "#A5D6A7",
                borderRadius: "5px",
              }}
              title="Share Live Customer Digital Menu Link & QR"
            >
              <span>📤</span>
              <span>Share Menu Link</span>
            </button>
            <button
              onClick={() => setIsAddingTable(true)}
              className="px-4 py-2 text-xs font-bold text-white rounded cursor-pointer shadow-sm active:scale-95 transition-transform"
              style={{ backgroundColor: "var(--rust)", borderRadius: "5px" }}
            >
              + Add table station
            </button>
          </div>
        </header>

        {errorMessage && (
          <div className="p-3 rounded text-xs" style={{ backgroundColor: "#FDF2F2", color: "var(--brick)", border: "1px solid #FCA5A5" }}>
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="p-12 text-center text-xs" style={{ color: "var(--ink-soft)" }}>
            Loading table stations...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs" style={{ color: "var(--ink-soft)" }}>
              <span>{tables.length} configured table stations</span>
              <span>Tap table to inspect slip or print QR chit</span>
            </div>

            {/* Grid of Table Chits (Tablet-first, min 44px touch targets) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {tables.map((table) => {
                const style = getStatusStyle(table.status);
                return (
                  <div
                    key={table.id}
                    onClick={() => openChitModal(table)}
                    className={`min-h-[120px] p-4 rounded text-left flex flex-col justify-between cursor-pointer transition-all active:scale-[0.98] ${style.border}`}
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
                      <span className="font-heading text-2xl font-bold" style={{ color: "var(--ink)" }}>
                        {table.table_number}
                      </span>
                      <span className={`text-xs font-semibold ${style.color}`}>
                        {style.text}
                      </span>
                    </div>

                    <div className="pt-3 mt-2 border-t border-dashed flex items-center justify-between" style={{ borderColor: "var(--hairline)" }}>
                      <span className="font-receipt text-[11px]" style={{ color: "var(--ink-soft)" }}>
                        QR: {table.qr_token.slice(0, 8)}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickCopyLink(table);
                          }}
                          className="text-[11px] font-bold hover:underline cursor-pointer px-1.5 py-0.5 rounded border"
                          style={{
                            color: copiedTableId === table.id ? "#2E7D32" : "var(--rust)",
                            borderColor: copiedTableId === table.id ? "#81C784" : "rgba(193, 101, 44, 0.3)",
                            backgroundColor: copiedTableId === table.id ? "#E8F5E9" : "transparent",
                          }}
                          title="Copy table menu URL"
                        >
                          {copiedTableId === table.id ? "✓ Copied" : "🔗 Copy"}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickWhatsApp(table);
                          }}
                          className="text-[11px] font-bold text-[#1B5E20] hover:underline cursor-pointer px-1.5 py-0.5 rounded border border-[#A5D6A7] bg-[#E8F5E9]"
                          title="Share on WhatsApp"
                        >
                          💬 WA
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Modal: QR Standee Print Chit */}
        {selectedChit && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(34, 29, 22, 0.45)" }}
            onClick={() => setSelectedChit(null)}
          >
            <div
              className="w-full max-w-sm p-6 rounded"
              style={{
                backgroundColor: "var(--paper)",
                border: "1px solid var(--hairline)",
                boxShadow: "var(--shadow-lg)",
                borderRadius: "4px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Printable Table Slip Motif */}
              <div
                ref={printFrameRef}
                className="p-6 rounded border-2 border-dashed text-center"
                style={{
                  backgroundColor: "var(--paper)",
                  borderColor: "var(--hairline)",
                }}
              >
                <div className="font-heading text-xl font-bold tracking-wide" style={{ color: "var(--rust)" }}>
                  {restaurantName}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
                  Scan to order from your phone
                </div>

                <div className="my-4 py-2 border-y border-dashed" style={{ borderColor: "var(--hairline)" }}>
                  <span className="text-xs" style={{ color: "var(--ink-soft)" }}>Table number</span>
                  <div className="font-heading text-4xl font-bold" style={{ color: "var(--ink)" }}>
                    {selectedChit.table_number}
                  </div>
                </div>

                {qrDataUrl && (
                  <div className="flex justify-center my-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrDataUrl}
                      alt={`QR Code for Table ${selectedChit.table_number}`}
                      className="w-48 h-48 rounded border"
                      style={{ borderColor: "var(--hairline)" }}
                    />
                  </div>
                )}

                {/* Direct 4-digit code banner for customers whose camera won't scan */}
                <div
                  className="my-3 py-2 px-3 rounded border border-dashed text-center"
                  style={{
                    backgroundColor: "var(--paper-dim)",
                    borderColor: "var(--hairline)",
                  }}
                >
                  <div className="text-[11px] font-medium" style={{ color: "var(--ink-soft)" }}>
                    Camera nahi chal raha? Enter code at:
                  </div>
                  <div className="text-[11px] font-bold mt-0.5 tracking-wide" style={{ color: "var(--rust)" }}>
                    orderdesk /enter
                  </div>
                  <div className="mt-1.5 flex items-center justify-center gap-1.5">
                    <span className="text-xs font-semibold" style={{ color: "var(--ink)" }}>
                      TABLE PASSCODE:
                    </span>
                    <span
                      className="px-2.5 py-0.5 rounded font-receipt font-bold text-base tracking-widest"
                      style={{
                        backgroundColor: "var(--paper)",
                        border: "1px solid var(--hairline)",
                        color: "var(--ink)",
                      }}
                    >
                      {getTableAccessCode(selectedChit.qr_token)}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] font-medium" style={{ color: "var(--ink-soft)" }}>
                  Fixed table standee · No daily reprint needed
                </div>
                <div className="font-receipt text-[10px] mt-1" style={{ color: "var(--ink-soft)" }}>
                  Token: {selectedChit.qr_token}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 mt-4 border-t border-dashed space-y-2" style={{ borderColor: "var(--hairline)" }}>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickCopyLink(selectedChit)}
                    className="py-2 px-2.5 rounded text-xs font-bold border cursor-pointer flex items-center justify-center gap-1.5"
                    style={{
                      borderColor: copiedTableId === selectedChit.id ? "#81C784" : "rgba(193, 101, 44, 0.35)",
                      color: copiedTableId === selectedChit.id ? "#1B5E20" : "var(--rust)",
                      backgroundColor: copiedTableId === selectedChit.id ? "#E8F5E9" : "#FFF8F2",
                    }}
                  >
                    <span>{copiedTableId === selectedChit.id ? "✓" : "📋"}</span>
                    <span>{copiedTableId === selectedChit.id ? "Link Copied!" : "Copy Link"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickWhatsApp(selectedChit)}
                    className="py-2 px-2.5 rounded text-xs font-bold text-white bg-[#25D366] hover:bg-[#20BA5A] cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>💬</span>
                    <span>WhatsApp</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
                    window.open(`${origin}/table/${selectedChit.qr_token}`, "_blank");
                  }}
                  className="w-full py-2 rounded text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{
                    backgroundColor: "var(--paper-dim)",
                    borderColor: "var(--hairline)",
                    color: "var(--ink)",
                  }}
                >
                  <span>👁️</span>
                  <span>Preview Customer Menu</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="w-full py-2.5 rounded text-xs font-bold text-white cursor-pointer"
                  style={{ backgroundColor: "var(--rust)", borderRadius: "4px" }}
                >
                  Print table standee
                </button>

                <button
                  type="button"
                  onClick={() => handleRegenerateToken(selectedChit.id)}
                  className="w-full py-2 text-xs font-medium rounded cursor-pointer"
                  style={{
                    backgroundColor: "transparent",
                    color: "var(--brick)",
                    border: "1px solid var(--hairline)",
                  }}
                >
                  Regenerate QR token
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedChit(null)}
                  className="w-full py-1.5 text-xs font-medium cursor-pointer"
                  style={{ color: "var(--ink-soft)" }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Add Table Station */}
        {isAddingTable && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(34, 29, 22, 0.45)" }}
            onClick={() => setIsAddingTable(false)}
          >
            <div
              className="w-full max-w-xs p-6 rounded"
              style={{
                backgroundColor: "var(--paper)",
                border: "1px solid var(--hairline)",
                boxShadow: "var(--shadow-lg)",
                borderRadius: "4px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start pb-2 mb-3 border-b border-dashed" style={{ borderColor: "var(--hairline)" }}>
                <h3 className="font-heading text-lg font-bold" style={{ color: "var(--ink)" }}>
                  Add Table Station
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddingTable(false)}
                  className="text-xs font-bold"
                  style={{ color: "var(--ink-soft)" }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleAddTable} className="space-y-3 text-xs">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--ink-soft)" }}>
                    Table identifier
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. T05, P-02, Bar-1"
                    value={newTableNumber}
                    onChange={(e) => setNewTableNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded font-semibold focus:outline-none"
                    style={{
                      backgroundColor: "var(--paper-dim)",
                      border: "1px solid var(--hairline)",
                      color: "var(--ink)",
                    }}
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-dashed" style={{ borderColor: "var(--hairline)" }}>
                  <button
                    type="button"
                    onClick={() => setIsAddingTable(false)}
                    className="px-3 py-1.5 rounded"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 rounded font-bold text-white"
                    style={{ backgroundColor: "var(--rust)", borderRadius: "4px" }}
                  >
                    {isSubmitting ? "Adding..." : "Add station"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      <ShareMenuModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        restaurantName={restaurantName}
        tables={tables}
      />
    </div>
  );
}
