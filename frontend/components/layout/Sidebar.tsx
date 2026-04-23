"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Briefcase, Bookmark, User, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import { toast } from "sonner";

const NAV = [
  { href: "/jobs", label: "Browse Jobs", icon: Briefcase },
  { href: "/saved-jobs", label: "Saved Jobs", icon: Bookmark },
  { href: "/profile", label: "Profile", icon: User },
];

interface SidebarProps {
  /** Passed from server layout — user from cookie-backed API call */
  user?: { name: string; email: string } | null;
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const storeUser = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  const displayUser = storeUser ?? user;
  const initials = displayUser?.name
    ?.split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clear();
    router.push("/");
    router.refresh();
    toast.success("Logged out");
  }

  return (
    <aside className="w-60 flex flex-col justify-between bg-bg-surface border-r border-border shrink-0 h-full">
      {/* Top */}
      <div className="flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6">
          <Link href="/" className="text-text-primary font-bold text-lg hover:opacity-90">
            ⚡ JobAI
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-1 px-3 py-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/jobs"
                ? pathname === "/jobs"
                : pathname.startsWith(href.split("?")[0]);

            return (
              <Link
                key={label}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm transition-colors",
                  isActive
                    ? "bg-accent-subtle text-accent font-semibold"
                    : "text-text-secondary hover:bg-bg-surface-2 hover:text-text-primary",
                )}
              >
                <Icon
                  size={18}
                  className={isActive ? "text-accent" : "text-text-muted"}
                />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom — user info */}
      <div className="border-t border-border px-5 py-4 flex items-center gap-3">
        {displayUser ? (
          <>
            <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold">{initials}</span>
            </div>
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="text-text-primary text-sm font-medium truncate">
                {displayUser.name}
              </span>
              <span className="text-text-muted text-xs truncate">
                {displayUser.email}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="text-text-muted hover:text-danger transition-colors shrink-0"
              title="Log out"
            >
              <LogOut size={16} />
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="text-accent-glow text-sm font-semibold hover:underline"
          >
            Log in
          </Link>
        )}
      </div>
    </aside>
  );
}
