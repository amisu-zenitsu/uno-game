"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Color, Value, Card as CardType } from "@/lib/gameLogic";

interface UnoCardProps {
  card: CardType;
  onClick?: () => void;
  className?: string;
  isPlayable?: boolean;
  isHidden?: boolean;
}

export function UnoCard({ card, onClick, className, isPlayable = false, isHidden = false }: UnoCardProps) {
  const { color, value } = card;

  // Map colors to Tailwind classes
  const colorMap = {
    Red: "bg-uno-red",
    Blue: "bg-uno-blue",
    Green: "bg-uno-green",
    Yellow: "bg-uno-yellow",
    Wild: "bg-uno-wild",
  };

  const gradientMap = {
    Red: "from-red-500 to-red-700 text-white",
    Blue: "from-blue-500 to-blue-700 text-white",
    Green: "from-green-500 to-green-700 text-white",
    Yellow: "from-yellow-400 to-yellow-600 text-black",
    Wild: "from-gray-800 to-black text-white",
  };

  const bgColorClass = isHidden ? "from-black to-zinc-900 text-red-500" : gradientMap[color];

  // Helper for displaying symbols instead of plain text
  const displayValue = () => {
    if (isHidden) return "UNO";
    switch (value) {
      case "Skip":
        return "⊘";
      case "Reverse":
        return "⇄";
      case "DrawTwo":
        return "+2";
      case "WildDrawFour":
        return "+4";
      case "Wild":
        return "W";
      default:
        return value;
    }
  };

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -20, opacity: 0 }}
      whileHover={isPlayable && onClick ? { y: -15, scale: 1.05 } : {}}
      onClick={isPlayable ? onClick : undefined}
      className={cn(
        "relative flex h-48 w-32 shrink-0 cursor-default flex-col items-center justify-center rounded-xl border border-white/20 bg-gradient-to-br shadow-xl transition-all",
        bgColorClass,
        isPlayable && onClick ? "cursor-pointer hover:shadow-2xl hover:border-white/40" : "",
        !isPlayable && "opacity-80 saturate-50",
        className
      )}
    >
      {/* Small top left icon */}
      <span className="absolute left-2 top-2 text-lg font-bold drop-shadow-md">
        {displayValue()}
      </span>

      {/* Main Center circle and icon */}
      <div 
        className={cn(
          "flex h-20 w-20 transform items-center justify-center rounded-full shadow-inner -rotate-12",
          color === "Wild"
            ? "bg-[conic-gradient(#ff5555_0deg_90deg,#55aa55_90deg_180deg,#ffaa00_180deg_270deg,#5555ff_270deg_360deg)] border-2 border-white/50"
            : "bg-white/20 backdrop-blur-sm"
        )}
      >
        <span className="text-5xl font-black drop-shadow-xl tracking-tighter shadow-black/50">
          {displayValue()}
        </span>
      </div>

      {/* Small bottom right icon */}
      <span className="absolute bottom-2 right-2 rotate-180 text-lg font-bold drop-shadow-md">
        {displayValue()}
      </span>
    </motion.div>
  );
}
