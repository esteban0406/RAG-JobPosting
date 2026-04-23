"use client";

import { Sparkles } from "lucide-react";
import { useAiStore } from "@/lib/ai-store";

export function AiFab() {
  const { isOpen, toggle } = useAiStore();

  if (isOpen) return null;

  return (
    <button
      onClick={toggle}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-accent text-white font-semibold text-sm px-4 py-3 rounded-full hover:opacity-90 transition-opacity"
      style={{ boxShadow: "0 4px 24px #7C3AED60" }}
    >
      <Sparkles size={16} />
      Ask AI
    </button>
  );
}
