"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EnterTableCodePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setIsLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/public/table/lookup-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Table code not recognized");
      }

      if (data.redirectUrl) {
        router.push(data.redirectUrl);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Lookup failed");
      setIsLoading(false);
    }
  }

  function handleDigitClick(digit: string) {
    if (code.length < 6) {
      setCode((prev) => prev + digit);
    }
  }

  function handleBackspace() {
    setCode((prev) => prev.slice(0, -1));
  }

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center p-4 selection:bg-amber-200"
      style={{ backgroundColor: "var(--paper)" }}
    >
      <div
        className="w-full max-w-sm rounded p-6 relative border"
        style={{
          backgroundColor: "var(--paper)",
          borderColor: "var(--hairline)",
          boxShadow: "var(--shadow-md)",
          borderRadius: "4px",
        }}
      >
        {/* Perforation dashed line at top */}
        <div className="absolute top-0 left-0 right-0 h-1 border-t-2 border-dashed border-amber-900/20" />

        {/* Header */}
        <div className="text-center pt-2 pb-5 border-b border-dashed" style={{ borderColor: "var(--hairline)" }}>
          <span className="font-heading text-xs tracking-wider uppercase font-bold" style={{ color: "var(--rust)" }}>
            Table Self-Order
          </span>
          <h1 className="font-heading text-2xl font-bold mt-1" style={{ color: "var(--ink)" }}>
            Enter Table Code
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
            Can&apos;t scan the QR code? Type the 4-digit code printed on your table standee.
          </p>
        </div>

        {/* Input & Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <div
              className="w-full py-3 px-4 rounded text-center tracking-[0.3em] font-receipt font-bold text-2xl"
              style={{
                backgroundColor: "var(--paper-dim)",
                border: "1px solid var(--hairline)",
                color: "var(--ink)",
                minHeight: "56px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {code || <span style={{ color: "var(--hairline)" }}>_ _ _ _</span>}
            </div>
          </div>

          {errorMessage && (
            <div
              className="p-2.5 rounded text-xs text-center font-medium"
              style={{
                backgroundColor: "#FDF2F0",
                color: "var(--brick)",
                border: "1px solid #F5C6CB",
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* Touch Number Pad for Mobile */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDigitClick(d)}
                className="h-12 rounded font-heading text-lg font-bold transition-colors active:scale-95 cursor-pointer"
                style={{
                  backgroundColor: "var(--paper-dim)",
                  border: "1px solid var(--hairline)",
                  color: "var(--ink)",
                }}
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCode("")}
              className="h-12 rounded text-xs font-semibold text-stone-500 hover:text-stone-800 transition-colors cursor-pointer"
              style={{
                backgroundColor: "transparent",
                border: "1px solid var(--hairline)",
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleDigitClick("0")}
              className="h-12 rounded font-heading text-lg font-bold transition-colors active:scale-95 cursor-pointer"
              style={{
                backgroundColor: "var(--paper-dim)",
                border: "1px solid var(--hairline)",
                color: "var(--ink)",
              }}
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-12 rounded text-xs font-semibold text-stone-600 transition-colors cursor-pointer"
              style={{
                backgroundColor: "transparent",
                border: "1px solid var(--hairline)",
              }}
            >
              ⌫
            </button>
          </div>

          {/* Submit CTA */}
          <button
            type="submit"
            disabled={!code || isLoading}
            className="w-full py-3 rounded text-sm font-bold text-white transition-opacity disabled:opacity-50 cursor-pointer"
            style={{
              backgroundColor: "var(--rust)",
              borderRadius: "4px",
            }}
          >
            {isLoading ? "Finding your table..." : "Open Menu"}
          </button>
        </form>

        {/* Footer info */}
        <div className="pt-4 mt-5 text-center border-t border-dashed" style={{ borderColor: "var(--hairline)" }}>
          <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
            Tip: You can also type your table number (e.g. <strong>T03</strong> or <strong>3</strong>)
          </p>
        </div>
      </div>
    </div>
  );
}
