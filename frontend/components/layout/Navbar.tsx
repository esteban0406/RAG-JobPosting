"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";

export function Navbar() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="bg-bg-surface border-b border-border">
      {/* Main bar */}
      <div className="h-[72px] flex items-center justify-between px-4 sm:px-8 lg:px-20">
        <Link
          href="/"
          className="text-text-primary font-bold text-[22px] hover:opacity-90"
        >
          ⚡ JobAI
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          <Link
            href="/jobs"
            className="text-text-secondary text-[15px] hover:text-text-primary transition-colors"
          >
            Browse Jobs
          </Link>
          {isLoggedIn ? (
            <Link
              href="/profile"
              className="text-text-secondary text-[15px] hover:text-text-primary transition-colors"
            >
              Profile
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-text-secondary text-[15px] hover:text-text-primary transition-colors"
            >
              Login
            </Link>
          )}
          <Link
            href="/register"
            className="bg-accent text-white font-semibold text-sm px-[22px] py-2.5 rounded-[var(--radius-md)] hover:opacity-90 transition-opacity"
          >
            Sign Up
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileMenuOpen((o) => !o)}
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-[var(--radius-sm)] text-text-muted hover:text-text-primary transition-colors"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="md:hidden flex flex-col border-t border-border px-4 py-3 gap-1">
          <Link
            href="/jobs"
            onClick={() => setMobileMenuOpen(false)}
            className="px-3 py-2.5 rounded-[var(--radius-md)] text-text-secondary text-sm hover:bg-bg-surface-2 hover:text-text-primary transition-colors"
          >
            Browse Jobs
          </Link>
          {isLoggedIn ? (
            <Link
              href="/profile"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2.5 rounded-[var(--radius-md)] text-text-secondary text-sm hover:bg-bg-surface-2 hover:text-text-primary transition-colors"
            >
              Profile
            </Link>
          ) : (
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2.5 rounded-[var(--radius-md)] text-text-secondary text-sm hover:bg-bg-surface-2 hover:text-text-primary transition-colors"
            >
              Login
            </Link>
          )}
          <Link
            href="/register"
            onClick={() => setMobileMenuOpen(false)}
            className="mt-1 flex items-center justify-center bg-accent text-white font-semibold text-sm px-4 py-2.5 rounded-[var(--radius-md)] hover:opacity-90 transition-opacity"
          >
            Sign Up
          </Link>
        </div>
      )}
    </nav>
  );
}
