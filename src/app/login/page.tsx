"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type StaffProfile = {
  id: string;
  name: string;
  role: string;
};

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
        setErrorMessage(err instanceof Error ? err.message : "Incorrect PIN");
        setIsShaking(true);
        setTimeout(() => {
          setIsShaking(false);
          setPin("");
        }, 350);
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
            setPin(pinParam);
            setTimeout(() => {
              handlePinSubmit(pinParam, targetStaff?.id, data.restaurantId);
            }, 200);
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
    <main
      className="min-h-screen flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: "var(--paper-dim)" }}
    >
      <div
        className="w-full max-w-[380px] p-6 sm:p-7"
        style={{
          backgroundColor: "var(--paper)",
          border: "1px solid var(--hairline)",
          borderRadius: "4px",
          boxShadow: "0 4px 16px rgba(42, 36, 28, 0.08)",
        }}
      >
        {/* Terminal Header */}
        <header className="pb-4 mb-4 border-b border-dashed" style={{ borderColor: "var(--hairline)" }}>
          <div className="flex items-center justify-between">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded"
              style={{
                backgroundColor: "var(--paper-dim)",
                color: "var(--rust)",
                border: "1px solid var(--hairline)",
              }}
            >
              Floor terminal
            </span>
            <span className="font-heading text-lg font-bold" style={{ color: "var(--rust)" }}>
              Order Desk
            </span>
          </div>

          <h1 className="font-heading text-2xl font-bold mt-2" style={{ color: "var(--ink)" }}>
            {showEmailRecovery ? "Owner sign-in" : "Staff access"}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
            Staff access · {restaurantName}
          </p>
        </header>

        {/* Staff / Owner Switcher */}
        <div
          className="flex p-1 rounded mb-4"
          style={{ backgroundColor: "var(--paper-dim)", border: "1px solid var(--hairline)" }}
        >
          <button
            type="button"
            onClick={() => {
              setShowEmailRecovery(false);
              setErrorMessage("");
            }}
            className="flex-1 py-1.5 text-xs font-semibold rounded cursor-pointer transition-colors"
            style={{
              backgroundColor: !showEmailRecovery ? "var(--paper)" : "transparent",
              color: !showEmailRecovery ? "var(--ink)" : "var(--ink-soft)",
              border: !showEmailRecovery ? "1px solid var(--hairline)" : "1px solid transparent",
            }}
          >
            Staff PIN pad
          </button>
          <button
            type="button"
            onClick={() => {
              setShowEmailRecovery(true);
              setErrorMessage("");
            }}
            className="flex-1 py-1.5 text-xs font-semibold rounded cursor-pointer transition-colors"
            style={{
              backgroundColor: showEmailRecovery ? "var(--paper)" : "transparent",
              color: showEmailRecovery ? "var(--rust)" : "var(--ink-soft)",
              border: showEmailRecovery ? "1px solid var(--hairline)" : "1px solid transparent",
            }}
          >
            Owner email login
          </button>
        </div>

        {!showEmailRecovery ? (
          <div>
            {/* Staff Selector Pills (When device is shared across shifts) */}
            {staffList.length > 0 && (
              <div className="mb-4">
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--ink-soft)" }}>
                  Select your profile
                </label>
                <div className="grid grid-cols-2 gap-1.5 max-h-28 overflow-y-auto pr-1">
                  {staffList.map((member) => {
                    const isSelected = selectedStaff?.id === member.id;
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          setSelectedStaff(member);
                          setPin("");
                          setErrorMessage("");
                        }}
                        className="flex items-center gap-2 px-2.5 py-2 rounded text-left transition-all cursor-pointer"
                        style={{
                          backgroundColor: isSelected ? "var(--paper-dim)" : "var(--paper)",
                          border: isSelected ? "1.5px solid var(--rust)" : "1px solid var(--hairline)",
                          color: isSelected ? "var(--rust)" : "var(--ink)",
                        }}
                      >
                        <span
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{
                            backgroundColor: isSelected ? "var(--rust)" : "var(--paper-dim)",
                            color: isSelected ? "#FFFFFF" : "var(--ink-soft)",
                          }}
                        >
                          {getInitials(member.name)}
                        </span>
                        <div className="truncate">
                          <div className="text-xs font-bold leading-tight truncate">{member.name}</div>
                          <div className="text-[10px] opacity-80 font-medium leading-tight">
                            {member.role === "owner" ? "👑 Owner" : member.role === "kitchen" ? "🍳 Kitchen" : "🛎️ Waiter"}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PIN Dot Indicators */}
            <div className="text-center py-2">
              <div className="flex justify-center gap-3 mb-2">
                {[0, 1, 2, 3].map((index) => {
                  const filled = pin.length > index;
                  return (
                    <div
                      key={index}
                      className="w-3.5 h-3.5 rounded-full border transition-all"
                      style={{
                        backgroundColor: filled ? "var(--rust)" : "transparent",
                        borderColor: isShaking
                          ? "var(--brick)"
                          : filled
                          ? "var(--rust)"
                          : "var(--hairline)",
                        transform: filled ? "scale(1.1)" : "scale(1)",
                      }}
                    />
                  );
                })}
              </div>

              {errorMessage ? (
                <p className="text-xs font-semibold mt-1" style={{ color: "var(--brick)" }}>
                  {errorMessage}
                </p>
              ) : (
                <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  Enter 4-digit PIN for {selectedStaff?.name || "terminal"}
                </p>
              )}
            </div>

            {/* Large Tactile 56px Touch Target Keypad */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleKeyPress(d)}
                  disabled={isSubmitting}
                  className="h-14 rounded text-xl font-heading font-bold cursor-pointer transition-transform active:scale-95 flex items-center justify-center"
                  style={{
                    backgroundColor: "var(--paper-dim)",
                    color: "var(--ink)",
                    border: "1px solid var(--hairline)",
                  }}
                >
                  {d}
                </button>
              ))}

              <button
                type="button"
                onClick={handleClear}
                disabled={isSubmitting || pin.length === 0}
                className="h-14 rounded text-xs font-semibold uppercase tracking-wider cursor-pointer transition-transform active:scale-95 flex items-center justify-center"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--ink-soft)",
                  border: "1px solid var(--hairline)",
                }}
              >
                Clear
              </button>

              <button
                type="button"
                onClick={() => handleKeyPress("0")}
                disabled={isSubmitting}
                className="h-14 rounded text-xl font-heading font-bold cursor-pointer transition-transform active:scale-95 flex items-center justify-center"
                style={{
                  backgroundColor: "var(--paper-dim)",
                  color: "var(--ink)",
                  border: "1px solid var(--hairline)",
                }}
              >
                0
              </button>

              <button
                type="button"
                onClick={handleBackspace}
                disabled={isSubmitting || pin.length === 0}
                className="h-14 rounded text-sm font-semibold cursor-pointer transition-transform active:scale-95 flex items-center justify-center"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--ink-soft)",
                  border: "1px solid var(--hairline)",
                }}
              >
                ⌫
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRecoverySubmit} className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--ink-soft)" }}>
                Owner email address
              </label>
              <input
                required
                type="email"
                placeholder="owner@restaurant.com"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded border focus:outline-none"
                style={{
                  backgroundColor: "var(--paper)",
                  borderColor: "var(--hairline)",
                  color: "var(--ink)",
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--ink-soft)" }}>
                Master password
              </label>
              <input
                required
                type="password"
                placeholder="••••••••"
                value={recoveryPassword}
                onChange={(e) => setRecoveryPassword(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded border focus:outline-none"
                style={{
                  backgroundColor: "var(--paper)",
                  borderColor: "var(--hairline)",
                  color: "var(--ink)",
                }}
              />
            </div>

            {errorMessage && (
              <p className="text-xs font-semibold" style={{ color: "var(--brick)" }}>
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isRecoverySubmitting}
              className="w-full py-2.5 rounded text-xs font-bold text-white cursor-pointer transition-opacity"
              style={{
                backgroundColor: "var(--rust)",
                borderRadius: "6px",
              }}
            >
              {isRecoverySubmitting ? "Signing in..." : "Sign in to restaurant"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
