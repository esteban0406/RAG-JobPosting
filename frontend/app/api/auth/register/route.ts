import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { setAuthCookies } from "@/lib/auth-cookies";

const API = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:4000/api/v1";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    return NextResponse.json(
      { message: error.message ?? "Registration failed" },
      { status: res.status },
    );
  }

  const { accessToken, refreshToken } = await res.json();
  const cookieStore = await cookies();
  setAuthCookies(cookieStore, { accessToken, refreshToken });

  return NextResponse.json({ ok: true });
}
