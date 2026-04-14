"use client";

import { useEffect } from "react";
import { fetchApi } from "@/lib/api";
import { useAuthStore, type UserProfile } from "@/lib/auth-store";

/**
 * Placed in root layout — silently hydrates the Zustand auth store
 * by attempting to fetch the current user profile on mount.
 * The httpOnly cookie is sent automatically by the browser.
 */
export function AuthProvider() {
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    fetchApi<UserProfile>("/users/me")
      .then(setUser)
      .catch(() => {
        // Not authenticated — store stays empty, that's fine
      });
  }, [setUser]);

  return null;
}
