"use client";

import { useState, useEffect } from "react";
import { Menu } from "lucide-react";
import Link from "next/link";
import { Sidebar, SidebarContent } from "@/components/layout/Sidebar";
import { AiPanel } from "@/components/ai/AiPanel";
import { AiFab } from "@/components/ai/AiFab";
import { useAiStore } from "@/lib/ai-store";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isMobile;
}

interface AppShellProps {
  user?: { name: string; email: string; hasResume?: boolean } | null;
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const { isOpen, close } = useAiStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useIsMobile();

  return (
    <div className="flex flex-col h-screen bg-bg-base overflow-hidden">
      {/* Mobile top bar — only visible below lg */}
      <div className="flex lg:hidden h-14 items-center justify-between px-4 bg-bg-surface border-b border-border shrink-0">
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-sm)] text-text-muted hover:text-text-primary transition-colors"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <Link
          href="/"
          className="text-text-primary font-bold text-lg hover:opacity-90"
        >
          ⚡ JobAI
        </Link>
        {/* Spacer to keep logo centered */}
        <div className="w-9" />
      </div>

      {/* Main layout row */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar — hidden below lg */}
        <Sidebar user={user} />

        {/* Main content */}
        <main className="overflow-y-auto transition-all duration-300 flex-1 min-w-0">
          {children}
        </main>

        {/* AI panel — desktop only side panel */}
        {isOpen && (
          <div className="hidden lg:block w-[40%] h-full overflow-hidden border-l border-border shrink-0">
            <AiPanel
              isLoggedIn={!!user}
              hasResume={!!user?.hasResume}
              onClose={close}
            />
          </div>
        )}
      </div>

      {/* Mobile sidebar drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="w-72 p-0 bg-bg-surface border-border [&>button]:text-text-muted [&>button]:hover:text-text-primary"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent
            user={user}
            onNavigate={() => setDrawerOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Mobile AI panel — full-screen sheet, only active below lg */}
      <Sheet open={isOpen && isMobile} onOpenChange={(o) => !o && close()}>
        <SheetContent
          side="right"
          className="w-full max-w-full p-0 bg-bg-surface border-border [&>button]:hidden"
        >
          <SheetTitle className="sr-only">AI Assistant</SheetTitle>
          <AiPanel
            isLoggedIn={!!user}
            hasResume={!!user?.hasResume}
            onClose={close}
          />
        </SheetContent>
      </Sheet>

      <AiFab />
    </div>
  );
}
