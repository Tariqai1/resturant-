"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type StaffProfile = {
  id: string;
  name: string;
  role: string;
};

const KEYPAD_BUTTONS = [
  { digit: "1", sub: "" },
  { digit: "2", sub: "ABC" },
  { digit: "3", sub: "DEF" },
  { digit: "4", sub: "GHI" },
  { digit: "5", sub: "JKL" },
  { digit: "6", sub: "MNO" },
  { digit: "7", sub: "PQRS" },
  { digit: "8", sub: "TUV" },
  { digit: "9", sub: "WXYZ" },
];

export default function TerminalLoginPage() {
  const router = useRouter();

  // Terminal state
  const [restaurantId, setRestaurantId] = useState("");
  const [restaurantName, setRestaurantName] = useState("Order Desk");
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffProfile | null>(null);

  // PIN state
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isShaking, setIsShaking] = useState(false);
  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(false);

  // Owner recovery toggle
  const [showEmailRecovery, setShowEmailRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [isRecoverySubmitting, setIsRecoverySubmitting] = useState(false);

  const handlePinSubmit = useCallback(
    async (pinToVerify: string, overrideStaffId?: string, overrideRestoId?: string) => {
      if (pinToVerify.length !== 4 || isSubmitting) return;

      setIsSubmitting(true);
      setErrorMessage("");

      try {
        const res = await fetch("/api/auth/pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staffId: overrideStaffId || selectedStaff?.id,
            restaurantId: overrideRestoId || restaurantId,
            pin: pinToVerify,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || "Incorrect PIN");
        }

        router.push(data.redirect || "/");
        router.refresh();
      } catch (err) {
        setIsAutoLoggingIn(false);
        setErrorMessage(err instanceof Error ? err.message : "Incorrect PIN");
        setIsShaking(true);
        setTimeout(() => {
          setIsShaking(false);
          setPin("");
        }, 400);
        setIsSubmitting(false);
      }
    },
    [isSubmitting, selectedStaff, restaurantId, router]
  );

  useEffect(() => {
    let isMounted = true;
    const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const restoParam = searchParams.get("resto") || "";
    const roleParam = searchParams.get("role") || "";
    const staffParam = searchParams.get("staff") || "";
    const pinParam = searchParams.get("pin") || "";

    const apiUrl = restoParam ? `/api/auth/pin?resto=${encodeURIComponent(restoParam)}` : "/api/auth/pin";

    fetch(apiUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        if (data.restaurantId) setRestaurantId(data.restaurantId);
        if (data.restaurantName) setRestaurantName(data.restaurantName);
        if (data.staff?.length > 0) {
          setStaffList(data.staff);

          let targetStaff = data.staff[0];
          if (staffParam) {
            const found = data.staff.find((s: StaffProfile) => s.id === staffParam);
            if (found) targetStaff = found;
          } else if (roleParam) {
            const found = data.staff.find((s: StaffProfile) => s.role.toLowerCase() === roleParam.toLowerCase());
            if (found) targetStaff = found;
          }
          setSelectedStaff(targetStaff);

          // 1-Tap Magic auto-login if valid 4-digit pin in query
          if (pinParam && pinParam.length === 4) {
            setIsAutoLoggingIn(true);
            setPin(pinParam);
            setTimeout(() => {
              handlePinSubmit(pinParam, targetStaff?.id, data.restaurantId);
            }, 300);
          }
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [handlePinSubmit]);

  function handleKeyPress(digit: string) {
    if (isSubmitting || pin.length >= 4) return;
    setErrorMessage("");
    const nextPin = pin + digit;
    setPin(nextPin);

    if (nextPin.length === 4) {
      handlePinSubmit(nextPin);
    }
  }

  function handleBackspace() {
    if (isSubmitting || pin.length === 0) return;
    setErrorMessage("");
    setPin((prev) => prev.slice(0, -1));
  }

  function handleClear() {
    if (isSubmitting) return;
    setErrorMessage("");
    setPin("");
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (showEmailRecovery) return;

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleKeyPress(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === "Escape" || e.key === "c" || e.key === "C") {
        e.preventDefault();
        handleClear();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function handleRecoverySubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsRecoverySubmitting(true);
    setErrorMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: recoveryEmail,
        password: recoveryPassword,
      });

      if (error) throw new Error(error.message);

      router.push("/");
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Sign-in failed");
      setIsRecoverySubmitting(false);
    }
  }

  function getInitials(name: string): string {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  return (
    <main className="min-h-screen bg-[#0A0806] text-[#EDE8E1] flex items-center justify-center p-4 sm:p-6 relative overflow-hidden selection:bg-[#D96B27] selection:text-white">
      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-[#D96B27]/12 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-amber-500/5 rounded-full blur-[120px]" />
      </div>

      {/* 1-TAP MAGIC AUTO-LOGIN SPLASH OVERLAY */}
      {isAutoLoggingIn && (
        <div className="fixed inset-0 z-50 bg-[#0B0907]/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center animate-fade-in">
          <div className="relative mb-6">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-[#D96B27] to-[#F59E0B] flex items-center justify-center text-4xl shadow-[0_0_50px_rgba(217,107,39,0.5)] border border-amber-300/30 animate-pulse">
              {selectedStaff?.role === "owner" ? "👑" : selectedStaff?.role === "kitchen" ? "🍳" : "🛎️"}
            </div>
            <div className="absolute -inset-2 rounded-3xl border border-[#D96B27]/40 animate-ping opacity-30" />
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#1F1711] border border-[#3E2D20] text-xs font-mono text-amber-400 mb-3 shadow-inner">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>1-TAP MAGIC CLOCK-IN</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Welcome, {selectedStaff?.name || "Team Member"}!
          </h2>
          <p className="text-xs text-[#A89F91] mt-1 font-mono uppercase tracking-wider">
            {selectedStaff?.role === "owner"
              ? "👑 Owner Management Session"
              : selectedStaff?.role === "kitchen"
              ? "🍳 Kitchen Display Rail"
              : "🛎️ Floor Waiter Terminal"}
          </p>

          <div className="mt-8 flex flex-col items-center gap-2.5">
            <div className="w-52 h-2 bg-[#221A14] rounded-full overflow-hidden border border-[#3A2D22]">
              <div className="h-full w-full bg-gradient-to-r from-[#D96B27] via-amber-400 to-emerald-400 animate-pulse" />
            </div>
            <span className="text-[11px] text-[#8C8275] font-mono">Launching restaurant dashboard...</span>
          </div>
        </div>
      )}

      {/* Main Luxury Glass Card */}
      <div className="w-full max-w-[420px] bg-[#16120E]/95 border border-[#2F251E] rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/90 backdrop-blur-xl relative z-10 space-y-6">
        {/* Terminal Header */}
        <header className="text-center space-y-2 border-b border-[#261E17] pb-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#201812] border border-[#382B20] text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Floor Terminal</span>
            </span>

            <span className="text-xs font-bold font-mono tracking-wider text-[#D96B27] uppercase">
              Order Desk
            </span>
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              {restaurantName}
            </h1>
            <p className="text-xs text-[#8C8275] font-medium mt-0.5">
              {showEmailRecovery ? "Owner Account Recovery" : "Staff PIN Access & Shift Clock-In"}
            </p>
          </div>
        </header>

        {/* Staff / Owner Tab Switcher */}
        <div className="grid grid-cols-2 p-1 bg-[#100C09] rounded-xl border border-[#2A2018]">
          <button
            type="button"
            onClick={() => {
              setShowEmailRecovery(false);
              setErrorMessage("");
            }}
            className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              !showEmailRecovery
                ? "bg-[#D96B27] text-white shadow-lg shadow-[#D96B27]/25"
                : "text-[#8C8275] hover:text-white"
            }`}
          >
            <span>🔢</span>
            <span>Staff PIN Pad</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowEmailRecovery(true);
              setErrorMessage("");
            }}
            className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              showEmailRecovery
                ? "bg-[#D96B27] text-white shadow-lg shadow-[#D96B27]/25"
                : "text-[#8C8275] hover:text-white"
            }`}
          >
            <span>👑</span>
            <span>Owner Login</span>
          </button>
        </div>

        {!showEmailRecovery ? (
          <div className="space-y-4">
            {/* Staff Selector Pills */}
            {staffList.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-[#8C8275] uppercase">
                  <span>Select Staff Profile:</span>
                  <span className="text-[#D96B27]">{staffList.length} registered</span>
                </div>

                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto pr-1">
                  {staffList.map((member) => {
                    const isSelected = selectedStaff?.id === member.id;
                    const roleLabel =
                      member.role === "owner"
                        ? "👑 Owner"
                        : member.role === "kitchen"
                        ? "🍳 Kitchen"
                        : "🛎️ Waiter";

                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          setSelectedStaff(member);
                          setPin("");
                          setErrorMessage("");
                        }}
                        className={`flex items-center gap-2.5 p-2 rounded-xl text-left transition-all cursor-pointer border ${
                          isSelected
                            ? "bg-[#251C15] border-[#D96B27] ring-1 ring-[#D96B27]/40 text-white shadow-lg shadow-[#D96B27]/15"
                            : "bg-[#14100C] border-[#291F18] text-[#A89F91] hover:bg-[#1C1611] hover:text-white"
                        }`}
                      >
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
                            isSelected
                              ? "bg-[#D96B27] text-white"
                              : "bg-[#1E1712] text-[#8C8275] border border-[#30241B]"
                          }`}
                        >
                          {getInitials(member.name)}
                        </span>

                        <div className="truncate">
                          <div className="text-xs font-bold leading-tight truncate text-white">
                            {member.name}
                          </div>
                          <div
                            className={`text-[10px] font-semibold leading-tight mt-0.5 ${
                              isSelected ? "text-[#F38B47]" : "text-[#786D5F]"
                            }`}
                          >
                            {roleLabel}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Glowing PIN Dots Indicator */}
            <div className={`text-center py-2 transition-transform ${isShaking ? "animate-shake" : ""}`}>
              <div className="flex justify-center gap-4 mb-2">
                {[0, 1, 2, 3].map((index) => {
                  const filled = pin.length > index;
                  return (
                    <div
                      key={index}
                      className={`w-4 h-4 rounded-full transition-all duration-200 border ${
                        filled
                          ? "bg-gradient-to-tr from-[#D96B27] to-[#F59E0B] border-amber-300 shadow-[0_0_16px_rgba(217,107,39,0.9)] scale-110"
                          : "bg-[#120E0B] border-[#382B20]"
                      }`}
                    />
                  );
                })}
              </div>

              {errorMessage ? (
                <p className="text-xs font-bold text-red-400 mt-1 animate-fade-in flex items-center justify-center gap-1">
                  <span>⚠️</span>
                  <span>{errorMessage}</span>
                </p>
              ) : (
                <p className="text-xs text-[#8C8275]">
                  Enter 4-digit PIN for{" "}
                  <span className="text-white font-bold">{selectedStaff?.name || "Terminal"}</span>
                </p>
              )}
            </div>

            {/* Tactile Luxury POS Keypad */}
            <div className="grid grid-cols-3 gap-2.5">
              {KEYPAD_BUTTONS.map((item) => (
                <button
                  key={item.digit}
                  type="button"
                  onClick={() => handleKeyPress(item.digit)}
                  disabled={isSubmitting}
                  className="h-16 rounded-2xl bg-[#1B1510] hover:bg-[#281F17] active:bg-[#D96B27]/25 active:scale-95 border border-[#2E231B] text-white shadow-md transition-all flex flex-col items-center justify-center cursor-pointer disabled:opacity-50"
                >
                  <span className="text-2xl font-extrabold tracking-tight leading-none">
                    {item.digit}
                  </span>
                  {item.sub && (
                    <span className="text-[9px] font-mono tracking-widest text-[#7D7162] mt-0.5 uppercase">
                      {item.sub}
                    </span>
                  )}
                </button>
              ))}

              <button
                type="button"
                onClick={handleClear}
                disabled={isSubmitting || pin.length === 0}
                className="h-16 rounded-2xl bg-[#14100C] hover:bg-[#1E1712] active:scale-95 border border-[#2E231B] text-amber-500 font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center cursor-pointer disabled:opacity-30"
              >
                CLEAR
              </button>

              <button
                type="button"
                onClick={() => handleKeyPress("0")}
                disabled={isSubmitting}
                className="h-16 rounded-2xl bg-[#1B1510] hover:bg-[#281F17] active:bg-[#D96B27]/25 active:scale-95 border border-[#2E231B] text-white shadow-md transition-all flex flex-col items-center justify-center cursor-pointer disabled:opacity-50"
              >
                <span className="text-2xl font-extrabold tracking-tight leading-none">0</span>
              </button>

              <button
                type="button"
                onClick={handleBackspace}
                disabled={isSubmitting || pin.length === 0}
                className="h-16 rounded-2xl bg-[#14100C] hover:bg-[#1E1712] active:scale-95 border border-[#2E231B] text-slate-400 hover:text-white font-bold text-lg transition-all flex items-center justify-center cursor-pointer disabled:opacity-30"
              >
                ⌫
              </button>
            </div>
          </div>
        ) : (
          /* Owner Email & Password Form */
          <form onSubmit={handleRecoverySubmit} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="block text-xs font-mono uppercase text-[#8C8275]">
                Owner Email Address
              </label>
              <input
                required
                type="email"
                placeholder="owner@restaurant.com"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#120E0B] border border-[#2E231B] focus:border-[#D96B27] rounded-xl text-xs text-white placeholder-[#5A4E42] outline-none transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-mono uppercase text-[#8C8275]">
                Master Password
              </label>
              <input
                required
                type="password"
                placeholder="••••••••••••"
                value={recoveryPassword}
                onChange={(e) => setRecoveryPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#120E0B] border border-[#2E231B] focus:border-[#D96B27] rounded-xl text-xs text-white placeholder-[#5A4E42] outline-none transition-colors"
              />
            </div>

            {errorMessage && (
              <p className="text-xs font-semibold text-red-400 bg-red-950/40 p-2.5 rounded-lg border border-red-900/40">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isRecoverySubmitting}
              className="w-full py-3 bg-gradient-to-r from-[#D96B27] to-[#B85418] hover:from-[#E3752F] text-white rounded-xl text-xs font-bold shadow-lg shadow-[#D96B27]/25 transition-all cursor-pointer disabled:opacity-50"
            >
              {isRecoverySubmitting ? "Authenticating..." : "Sign in to Restaurant"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
