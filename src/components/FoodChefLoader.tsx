"use client";

import { useEffect, useState } from "react";

type FoodChefLoaderProps = {
  message?: string;
  subMessage?: string;
  size?: "sm" | "md" | "lg";
};

const CHEF_QUOTES = [
  "Simmering the authentic spices...",
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
  { emoji: "🍹", name: "Cooler Drinks" },
  { emoji: "🍨", name: "Kulfi & Desserts" },
];

export default function FoodChefLoader({
  message,
  subMessage,
  size = "md",
}: FoodChefLoaderProps) {
  const [foodIndex, setFoodIndex] = useState(0);
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    const foodTimer = setInterval(() => {
      setFoodIndex((prev) => (prev + 1) % DELICACIES.length);
    }, 1400);

    const quoteTimer = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % CHEF_QUOTES.length);
    }, 2200);

    return () => {
      clearInterval(foodTimer);
      clearInterval(quoteTimer);
    };
  }, []);

  const currentFood = DELICACIES[foodIndex];
  const currentQuote = message || CHEF_QUOTES[quoteIndex];

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 select-none">
      {/* Animated Sizzling Food Stage */}
      <div className="relative flex items-center justify-center">
        {/* Pulsing Ambient Glow Ring */}
        <div className="absolute -inset-4 rounded-full bg-gradient-to-tr from-amber-500/20 via-orange-500/15 to-rose-500/20 blur-xl animate-pulse" />

        {/* Outer Circular Platter Frame */}
        <div
          className={`relative rounded-full border-2 border-amber-500/40 bg-gradient-to-b from-slate-900 via-slate-950 to-black shadow-2xl flex items-center justify-center ${
            size === "sm" ? "w-20 h-20" : size === "lg" ? "w-36 h-36" : "w-28 h-28"
          }`}
        >
          {/* Animated Steam lines rising */}
          <div className="absolute -top-4 flex items-center gap-1 opacity-80 pointer-events-none">
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
              size === "sm" ? "text-3xl" : size === "lg" ? "text-6xl" : "text-4xl"
            }`}
          >
            {currentFood.emoji}
          </div>

          {/* Spinning Outer Ring Accent */}
          <div className="absolute inset-0 rounded-full border border-amber-500/30 border-t-amber-400 animate-spin" style={{ animationDuration: "3s" }} />
        </div>
      </div>

      {/* Dynamic Text Messages */}
      <div className="space-y-1 max-w-xs">
        <h4 className="text-sm font-black text-white tracking-wide bg-gradient-to-r from-amber-200 via-amber-300 to-orange-400 bg-clip-text text-transparent">
          {currentQuote}
        </h4>
        <p className="text-[11px] text-slate-400 font-mono">
          {subMessage || `Preparing ${currentFood.name}...`}
        </p>
      </div>

      {/* Micro Loading Bar */}
      <div className="w-32 h-1 bg-slate-800 rounded-full overflow-hidden">
        <div className="w-full h-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 rounded-full animate-pulse" />
      </div>
    </div>
  );
}
