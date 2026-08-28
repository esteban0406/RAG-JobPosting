import "server-only";
import { cookies } from "next/headers";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

export const ACCESS_TOKEN_COOKIE = "access-token";
export const REFRESH_TOKEN_COOKIE = "refresh-token";

// Kept in sync by convention with the backend's JWT_EXPIRES_IN / REFRESH_TOKEN_TTL_DAYS defaults.
const ACCESS_TOKEN_MAX_AGE = 60 * 15; // 15m
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30d

export function setAuthCookies(
  cookieStore: CookieStore,
  tokens: { accessToken: string; refreshToken: string },
): void {
  cookieStore.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  cookieStore.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}

export function clearAuthCookies(cookieStore: CookieStore): void {
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
}
