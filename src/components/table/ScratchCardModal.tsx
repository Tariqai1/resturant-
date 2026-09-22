"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

export type ScratchRewardData = {
  restaurantName: string;
  tableNumber: string;
  rewardTitle: string;
  rewardSubtitle: string;
  voucherCode: string;
  minOrderValue?: number;
  shareUrl?: string;
};

interface ScratchCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ScratchRewardData;
}

export default function ScratchCardModal({
  isOpen,
  onClose,
  data,
}: ScratchCardModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isScratching, setIsScratching] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const scratchPercentageRef = useRef(0);

  // Initialize Canvas Foil
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Reset composite operation
    ctx.globalCompositeOperation = "source-over";

    // Draw metallic gold/amber gradient
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#D97706"); // Amber-600
    gradient.addColorStop(0.3, "#F59E0B"); // Amber-500
    gradient.addColorStop(0.6, "#FCD34D"); // Amber-300
    gradient.addColorStop(1, "#B45309"); // Amber-700

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Decorative texture & sparkles
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    for (let i = 0; i < 25; i++) {
      const x = (i * 37) % canvas.width;
      const y = (i * 29) % canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, (i % 3) + 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Callout text on the foil
    ctx.fillStyle = "#78350F";
    ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✨ SCRATCH WITH FINGER ✨", canvas.width / 2, canvas.height / 2 - 8);

    ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "#92400E";
    ctx.fillText("To reveal your secret dining gift!", canvas.width / 2, canvas.height / 2 + 14);

    scratchPercentageRef.current = 0;
    setIsRevealed(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Short delay for DOM render
      const timer = setTimeout(initCanvas, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initCanvas]);

  // Scratch action
  const scratch = (clientX: number, clientY: number) => {
    if (isRevealed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();

    // Haptic tick if supported
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        // ignore
      }
    }

    // Check clear percentage periodically
    checkScratchPercentage(canvas, ctx);
  };

  const checkScratchPercentage = (
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D
  ) => {
    if (scratchPercentageRef.current > 40) return;

    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      let transparentPixels = 0;
      const totalPixels = data.length / 4;

      // Sample every 8th pixel for fast 60fps performance
      for (let i = 3; i < data.length; i += 32) {
        if (data[i] === 0) {
          transparentPixels++;
        }
      }

      const pct = (transparentPixels / (totalPixels / 8)) * 100;
      scratchPercentageRef.current = pct;

      if (pct > 35 && !isRevealed) {
        setIsRevealed(true);
        // Clear entire canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (typeof window !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate([20, 40, 30]);
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // Fallback
      setIsRevealed(true);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setIsScratching(true);
    scratch(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isScratching) return;
    scratch(e.clientX, e.clientY);
  };

  const handlePointerUp = () => {
    setIsScratching(false);
  };

  const copyCode = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(data.voucherCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // WhatsApp Voucher Message
  const sendToWhatsApp = () => {
    const text = `🎉 *${data.restaurantName} — VIP Dining Voucher* 🎟️
━━━━━━━━━━━━━━━━━━━━
🎁 *Reward:* ${data.rewardTitle}
🔑 *Voucher Code:* ${data.voucherCode}
📍 *Table:* ${data.tableNumber}
⏰ *Validity:* Next 15 Days on Dine-in & Takeaway
━━━━━━━━━━━━━━━━━━━━
_Yeh WhatsApp message agle visit par cashier ya waiter ko dikhayein to redeem!_`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  // Viral WhatsApp Referral Message
  const shareWithFriends = () => {
    const shareLink = data.shareUrl || (typeof window !== "undefined" ? window.location.href : "");
    const text = `Bhai! Maine aaj *${data.restaurantName}* par khana khaya, taste aur service bohot zabardast hai! 😋🔥

Unhone dosto ke liye special 15% discount voucher diya hai:
👉 ${shareLink}

Agli baar sath chalte hain! 🍽️`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in"
      style={{ backgroundColor: "rgba(17, 24, 39, 0.75)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border flex flex-col items-center p-6 text-center animate-scale-up"
        style={{
          backgroundColor: "#FFFDF9",
          borderColor: "rgba(245, 158, 11, 0.4)",
          color: "#1F2937",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-widest bg-amber-100 text-amber-900 mb-3 border border-amber-300">
          <span>🎁</span>
          <span>Google Pay Style Reward</span>
        </div>

        <h3 className="text-xl font-black tracking-tight text-stone-900 mb-1">
          {data.restaurantName}
        </h3>
        <p className="text-xs text-stone-500 mb-4 font-medium">
          Aapki table ke liye ek special mystery voucher mila hai!
        </p>

        {/* SCRATCH CARD CONTAINER */}
        <div className="relative w-[280px] h-[160px] rounded-2xl overflow-hidden shadow-inner border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-100 flex flex-col items-center justify-center select-none touch-none mb-4">
          {/* UNDERNEATH REWARD CONTENT */}
          <div className="flex flex-col items-center justify-center p-3 text-center">
            <span className="text-3xl mb-1">🎉</span>
            <div className="text-base font-extrabold text-amber-950 leading-tight">
              {data.rewardTitle}
            </div>
            <div className="text-[11px] text-stone-600 font-medium mt-0.5">
              {data.rewardSubtitle}
            </div>

            {/* Voucher Code Chip */}
            <div
              onClick={copyCode}
              className="mt-2.5 px-3 py-1 bg-white/90 border border-dashed border-amber-600 rounded-lg flex items-center gap-2 cursor-pointer active:scale-95 transition-transform"
            >
              <span className="font-mono font-black text-xs text-amber-900 tracking-wider">
                {data.voucherCode}
              </span>
              <span className="text-[10px] text-amber-700 font-bold">
                {copiedCode ? "✓ Copied" : "📋 Copy"}
              </span>
            </div>
          </div>

          {/* CANVAS FOIL OVERLAY */}
          <canvas
            ref={canvasRef}
            width={280}
            height={160}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`absolute inset-0 cursor-pointer transition-opacity duration-500 ${
              isRevealed ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
          />
        </div>

        {/* Scratch instructions or congratulations */}
        <div className="text-xs font-semibold text-stone-600 mb-5">
          {isRevealed ? (
            <span className="text-emerald-700 font-bold flex items-center justify-center gap-1">
              <span>🎊</span> <span>Voucher Unlocked! Valid for 15 Days</span>
            </span>
          ) : (
            <span className="text-stone-500 animate-pulse">
              👆 Foil ko ungli se scratch karein
            </span>
          )}
        </div>

        {/* ACTION BUTTONS */}
        <div className="w-full space-y-2.5">
          {/* 1-Click WhatsApp Save */}
          <button
            type="button"
            onClick={sendToWhatsApp}
            className="w-full py-3 px-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs text-white shadow-md active:scale-[0.98] transition-transform cursor-pointer"
            style={{ backgroundColor: "#25D366" }}
          >
            <span className="text-base">📲</span>
            <span>WhatsApp par ₹100 Voucher Save Karein</span>
          </button>

          {/* Viral Friend Referral */}
          <button
            type="button"
            onClick={shareWithFriends}
            className="w-full py-2.5 px-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs text-stone-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 active:scale-[0.98] transition-transform cursor-pointer"
          >
            <span>👥</span>
            <span>Dost ko 15% OFF Voucher Bhejo</span>
          </button>
        </div>

        {/* Dismiss CTA */}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 text-xs font-medium text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
        >
          Menu par wapas jayein ✕
        </button>
      </div>
    </div>
  );
}
