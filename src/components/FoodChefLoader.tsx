"use client";

import { useEffect, useState } from "react";

type FoodChefLoaderProps = {
  message?: string;
  subMessage?: string;
  size?: "sm" | "md" | "lg";
  variant?: "dark" | "light" | "luxury";
  restaurantName?: string;
  tableNumber?: string;
};

const CHEF_QUOTES = [
  "Simmering authentic spices...",
  "Chef is plating your fresh menu...",
  "Heating up the tandoor...",
  "Sizzling the ingredients...",
  "Setting up your digital dining desk...",
  "Almost ready to serve...",
];

const DELICACIES = [
  { emoji: "🍲", name: "Handi Biryani" },
  { emoji: "🥘", name: "Paneer Makhani" },
  { emoji: "🍢", name: "Tandoori Tikka" },
  { emoji: "🫓", name: "Butter Naan" },
  { emoji: "🥟", name: "Steamed Momos" },
  { emoji: "🍹", name: "Signature Cooler" },
  { emoji: "🍨", name: "Royal Kesar Kulfi" },
];

export default function FoodChefLoader({
  message,
  subMessage,
  size = "md",
  variant = "dark",
  restaurantName,
  tableNumber,
}: FoodChefLoaderProps) {
  const [foodIndex, setFoodIndex] = useState(0);
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    const foodTimer = setInterval(() => {
      setFoodIndex((prev) => (prev + 1) % DELICACIES.length);
    }, 1300);

    const quoteTimer = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % CHEF_QUOTES.length);
    }, 2000);

    return () => {
      clearInterval(foodTimer);
      clearInterval(quoteTimer);
    };
  }, []);

  const currentFood = DELICACIES[foodIndex];
  const currentQuote = message || CHEF_QUOTES[quoteIndex];
  const isLight = variant === "light";

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center space-y-4 select-none max-w-sm mx-auto">
      {/* Optional Restaurant & Table Tag */}
      {(restaurantName || tableNumber) && (
        <div className="flex items-center gap-2 mb-1 animate-in fade-in duration-500">
          {restaurantName && (
            <span
              className={`text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider border shadow-xs ${
                isLight
                  ? "bg-amber-100/80 text-amber-950 border-amber-300"
                  : "bg-amber-500/10 text-amber-300 border-amber-500/30"
              }`}
            >
              ✦ {restaurantName}
            </span>
          )}
          {tableNumber && (
            <span
              className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-full border shadow-xs ${
                isLight
                  ? "bg-stone-100 text-stone-900 border-stone-300"
                  : "bg-slate-800 text-slate-200 border-slate-700"
              }`}
            >
              Table {tableNumber}
            </span>
          )}
        </div>
      )}

      {/* Animated Sizzling Food Stage */}
      <div className="relative flex items-center justify-center">
        {/* Pulsing Ambient Glow Ring */}
        <div
          className={`absolute -inset-4 rounded-full blur-xl animate-pulse ${
            isLight
              ? "bg-gradient-to-tr from-amber-400/30 via-orange-300/25 to-amber-500/20"
              : "bg-gradient-to-tr from-amber-500/20 via-orange-500/15 to-rose-500/20"
          }`}
        />

        {/* Outer Circular Platter Frame */}
        <div
          className={`relative rounded-full border-2 border-amber-500/50 bg-gradient-to-b from-slate-900 via-slate-950 to-black shadow-2xl flex items-center justify-center ${
            size === "sm" ? "w-20 h-20" : size === "lg" ? "w-32 h-32 sm:w-36 sm:h-36" : "w-28 h-28"
          }`}
        >
          {/* Animated Steam lines rising */}
          <div className="absolute -top-4 flex items-center gap-1 opacity-90 pointer-events-none">
            <span className="text-sm animate-bounce text-amber-300" style={{ animationDelay: "0ms", animationDuration: "1.2s" }}>
              ♨️
            </span>
            <span className="text-xs animate-bounce text-orange-300" style={{ animationDelay: "300ms", animationDuration: "1.4s" }}>
              ♨️
            </span>
            <span className="text-sm animate-bounce text-amber-200" style={{ animationDelay: "600ms", animationDuration: "1.1s" }}>
              ♨️
            </span>
          </div>

          {/* Cycling Food Emoji with transition */}
          <div
            key={currentFood.name}
            className={`transition-all transform animate-in fade-in zoom-in-75 duration-300 ${
              size === "sm" ? "text-3xl" : size === "lg" ? "text-5xl sm:text-6xl" : "text-4xl"
            }`}
          >
            {currentFood.emoji}
          </div>

          {/* Spinning Outer Gold Ring Accent */}
          <div className="absolute inset-0 rounded-full border border-amber-500/30 border-t-amber-400 animate-spin" style={{ animationDuration: "2.8s" }} />
        </div>
      </div>

      {/* Dynamic Text Messages */}
      <div className="space-y-1.5 max-w-xs">
        <h4
          className={`text-sm sm:text-base font-extrabold tracking-wide ${
            isLight
              ? "text-stone-900"
              : "bg-gradient-to-r from-amber-200 via-amber-300 to-orange-400 bg-clip-text text-transparent"
          }`}
        >
          {currentQuote}
        </h4>
        <p
          className={`text-xs font-medium ${
            isLight ? "text-stone-500" : "text-slate-400 font-mono"
          }`}
        >
          {subMessage || `Serving ${currentFood.name}...`}
        </p>
      </div>

      {/* Micro Loading Bar */}
      <div
        className={`w-36 h-1.5 rounded-full overflow-hidden ${
          isLight ? "bg-amber-100 border border-amber-200" : "bg-slate-800"
        }`}
      >
        <div className="w-full h-full bg-gradient-to-r from-amber-500 via-orange-400 to-amber-500 rounded-full animate-pulse" />
      </div>
    </div>
  );
}
