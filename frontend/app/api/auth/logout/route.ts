import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { REFRESH_TOKEN_COOKIE, clearAuthCookies } from "@/lib/auth-cookies";

const API = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:4000/api/v1";

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (refreshToken) {
    await fetch(`${API}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {
      // Best-effort revocation — still clear the browser's cookies below
      // even if the backend call fails (e.g. it's momentarily unreachable).
    });
  }

  clearAuthCookies(cookieStore);
  return NextResponse.json({ ok: true });
}
