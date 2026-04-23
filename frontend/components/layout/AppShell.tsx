"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { AiPanel } from "@/components/ai/AiPanel";
import { AiFab } from "@/components/ai/AiFab";
import { useAiStore } from "@/lib/ai-store";

interface AppShellProps {
  user?: { name: string; email: string } | null;
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const { isOpen, close } = useAiStore();

  return (
    <div className="flex h-screen bg-bg-base overflow-hidden">
      <Sidebar user={user} />
      <main
        className={`overflow-y-auto transition-all duration-300 ${
          isOpen ? "w-[60%]" : "flex-1"
        }`}
      >
        {children}
      </main>
      {isOpen && (
        <div className="w-[40%] h-full overflow-hidden border-l border-border shrink-0">
          <AiPanel isLoggedIn={!!user} onClose={close} />
        </div>
      )}
      <AiFab />
    </div>
  );
}
