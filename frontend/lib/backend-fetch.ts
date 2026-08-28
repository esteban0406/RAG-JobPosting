import "server-only";
import { cookies } from "next/headers";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "./auth-cookies";

export const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL ?? "http://localhost:4000/api/v1";

function isReadableStreamBody(body: BodyInit | null | undefined): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as ReadableStream).getReader === "function"
  );
}

/**
 * The single place that attaches the access token to a backend call and,
 * on a 401, silently refreshes and retries once. Only callable from Route
 * Handlers/Server Actions (it mutates cookies) — never from a Server Component
 * render. A streamed request body can't be replayed, so it skips the retry.
 */
export async function backendFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  const call = (token?: string) => {
    const headers = new Headers(init.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    } else {
      headers.delete("Authorization");
    }
    return fetch(`${BACKEND_URL}${path}`, { ...init, headers });
  };

  const res = await call(accessToken);

  if (res.status !== 401 || isReadableStreamBody(init.body)) {
    return res;
  }

  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) {
    return res;
  }

  const refreshRes = await fetch(`${BACKEND_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!refreshRes.ok) {
    clearAuthCookies(cookieStore);
    return res;
  }

  const tokens = (await refreshRes.json()) as {
    accessToken: string;
    refreshToken: string;
  };
  setAuthCookies(cookieStore, tokens);

  return call(tokens.accessToken);
}
