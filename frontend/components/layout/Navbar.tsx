"use client";

import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";

export function Navbar() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  return (
    <nav className="h-[72px] bg-bg-surface border-b border-border flex items-center justify-between px-20">
      <Link href="/" className="text-text-primary font-bold text-[22px] hover:opacity-90">
        ⚡ JobAI
      </Link>
      <div className="flex items-center gap-8">
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
    </nav>
  );
}
