"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { getTableAccessCode } from "@/lib/utils/table-code";

export type ShareMenuTable = {
  id: string;
  table_number: string;
  qr_token: string;
};

type ShareMenuModalProps = {
  isOpen: boolean;
  onClose: () => void;
  restaurantName: string;
  tables: ShareMenuTable[];
  defaultTableId?: string;
};

export default function ShareMenuModal({
  isOpen,
  onClose,
  restaurantName,
  tables = [],
  defaultTableId,
}: ShareMenuModalProps) {
  const [selectedTableIndex, setSelectedTableIndex] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  // Sync default table if provided
  useEffect(() => {
    if (defaultTableId && tables.length > 0) {
      const idx = tables.findIndex((t) => t.id === defaultTableId);
      if (idx !== -1) setSelectedTableIndex(idx);
    } else {
      setSelectedTableIndex(0);
    }
  }, [defaultTableId, tables]);

  const activeTable: ShareMenuTable | undefined = tables[selectedTableIndex] || tables[0];
  const activeToken = activeTable?.qr_token || "sample-table-token";
  const activeTableNum = activeTable?.table_number || "T01";
  const customerMenuUrl = origin ? `${origin}/table/${activeToken}` : `/table/${activeToken}`;

  // Generate QR Code on token change
  useEffect(() => {
    if (!isOpen || !customerMenuUrl) return;
    let isMounted = true;
    QRCode.toDataURL(customerMenuUrl, {
      width: 360,
      margin: 2,
      color: {
        dark: "#2A2312",
        light: "#FFFFFF",
      },
    })
      .then((url) => {
        if (isMounted) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error("Failed to generate QR code:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, customerMenuUrl]);

  if (!isOpen) return null;

  async function handleCopy() {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(customerMenuUrl);
      } else {
        const input = document.createElement("input");
        input.value = customerMenuUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(15);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error("Copy failed:", e);
    }
  }

  function handleWhatsAppShare() {
    const text = `🍽️ *${restaurantName || "Order Desk"}* - Live Digital Menu\n\nBrowse our dishes, chef specials, and order directly from your phone:\n🔗 ${customerMenuUrl}\n\n✨ Instant table service & live cooking tracker!`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank");
  }

  function handlePreviewCustomerView() {
    window.open(customerMenuUrl, "_blank");
  }

  function handleDownloadQr() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `${restaurantName.toLowerCase().replace(/\s+/g, "_")}_table_${activeTableNum}_qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: "rgba(34, 29, 22, 0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-[#FAF6EC] border border-[#DCD1B7] rounded-t-3xl sm:rounded-lg shadow-2xl p-5 sm:p-6 relative overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ color: "#2A2312" }}
      >
        {/* Mobile sheet drag handle */}
        <div className="w-12 h-1.5 bg-[#C5BBA4] rounded-full mx-auto mb-2.5 sm:hidden shrink-0" />
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-dashed border-[#DCD1B7]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🍽️</span>
              <h3 className="font-heading text-xl font-bold tracking-tight text-[#2A2312]">
                Customer Digital Menu
              </h3>
            </div>
            <p className="text-xs text-[#7D7261] mt-0.5">
              Direct QR link for guests to browse dishes &amp; place live table orders
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#EBE2CD] text-[#7D7261] transition-colors cursor-pointer text-sm font-bold"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto py-4 space-y-5 flex-1 pr-1">
          {/* Restaurant & Table Selection */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-md bg-[#F2EBDA] border border-[#E2D8C0]">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#A8412F]">
                Restaurant Outpost
              </span>
              <div className="font-heading text-base font-bold text-[#2A2312]">
                {restaurantName || "Order Desk Restaurant"}
              </div>
            </div>

            {tables.length > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#5A4F3F]">Table:</span>
                <select
                  value={selectedTableIndex}
                  onChange={(e) => setSelectedTableIndex(Number(e.target.value))}
                  className="px-3 py-1.5 rounded text-xs font-bold bg-[#FAF6EC] border border-[#C5BBA4] text-[#2A2312] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#C1652C]"
                >
                  {tables.map((t, idx) => (
                    <option key={t.id || idx} value={idx}>
                      Table {t.table_number}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span className="text-xs font-semibold text-[#A8412F] bg-red-50 px-2 py-1 rounded">
                Table 1 (Default Station)
              </span>
            )}
          </div>

          {/* Quick Action Share Buttons Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* 1. Copy Link */}
            <button
              type="button"
              onClick={handleCopy}
              className="w-full py-2.5 px-3 rounded text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-98"
              style={{
                backgroundColor: copied ? "#2E7D32" : "#C1652C",
                color: "#FFFFFF",
              }}
            >
              <span>{copied ? "✓" : "📋"}</span>
              <span>{copied ? "Link Copied!" : "Copy Link"}</span>
            </button>

            {/* 2. WhatsApp Direct Share */}
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="w-full py-2.5 px-3 rounded text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm text-white bg-[#25D366] hover:bg-[#20BA5A] active:scale-98"
            >
              <span>💬</span>
              <span>WhatsApp Share</span>
            </button>

            {/* 3. Open Live Customer Preview */}
            <button
              type="button"
              onClick={handlePreviewCustomerView}
              className="w-full py-2.5 px-3 rounded text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm text-[#2A2312] bg-[#FAF6EC] hover:bg-[#EBE2CD] border border-[#C5BBA4] active:scale-98"
            >
              <span>👁️</span>
              <span>Open Customer View</span>
            </button>
          </div>

          {/* Live Link Input Box with 1-Tap Copy */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[#5A4F3F] flex items-center justify-between">
              <span>Full Customer URL</span>
              <span className="text-[10px] text-[#A8412F] font-normal">
                Share this link directly on social media, QR stickers, or chat
              </span>
            </label>
            <div className="flex items-center rounded-md border border-[#DCD1B7] bg-[#FFFFFF] overflow-hidden focus-within:ring-1 focus-within:ring-[#C1652C]">
              <input
                type="text"
                readOnly
                value={customerMenuUrl}
                className="w-full px-3 py-2 text-xs font-mono text-[#2A2312] bg-transparent outline-none select-all"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-2 text-xs font-bold text-[#C1652C] hover:bg-[#F5EEDC] transition-colors flex items-center gap-1 cursor-pointer border-l border-[#DCD1B7]"
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* QR Code Preview & Offline 4-Digit Passcode */}
          <div className="p-4 rounded-md bg-[#FFFFFF] border border-[#E2D8C0] flex flex-col sm:flex-row items-center gap-5">
            {qrDataUrl ? (
              <div className="flex-shrink-0 flex flex-col items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt={`QR Code for ${restaurantName} Table ${activeTableNum}`}
                  className="w-36 h-36 rounded border border-[#E2D8C0] p-1 bg-white shadow-sm"
                />
                <button
                  type="button"
                  onClick={handleDownloadQr}
                  className="mt-2 text-[11px] font-bold text-[#C1652C] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>📥</span> Download QR (.png)
                </button>
              </div>
            ) : (
              <div className="w-36 h-36 flex items-center justify-center bg-[#F2EBDA] rounded text-xs text-[#7D7261]">
                Rendering QR...
              </div>
            )}

            <div className="space-y-2.5 text-center sm:text-left flex-1">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#EAE1CB] text-[#5A4F3F]">
                  TABLE ${activeTableNum} STANDEE
                </span>
                <h4 className="font-heading text-sm font-bold text-[#2A2312] mt-1">
                  Instant Phone Camera Scanning
                </h4>
                <p className="text-xs text-[#7D7261] mt-0.5 leading-relaxed">
                  Guests scan this QR with their phone camera (Google Lens, iPhone Camera, or Paytm/GPay) to start ordering immediately.
                </p>
              </div>

              {/* 4-digit manual access passcode */}
              <div className="p-2.5 rounded bg-[#FAF6EC] border border-[#DCD1B7] inline-block sm:block text-center">
                <div className="text-[10px] font-semibold text-[#7D7261]">
                  Camera nahi chal raha? Guest can enter code at <span className="font-bold text-[#C1652C]">/enter</span>:
                </div>
                <div className="font-mono text-base font-bold tracking-widest text-[#2A2312] mt-0.5">
                  {getTableAccessCode(activeToken)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-dashed border-[#DCD1B7] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-semibold text-[#5A4F3F] hover:bg-[#EAE1CB] transition-colors cursor-pointer"
          >
            Done / Close
          </button>
        </div>
      </div>
    </div>
  );
}
