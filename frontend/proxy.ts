import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { REFRESH_TOKEN_COOKIE } from "@/lib/auth-cookies";

const PROTECTED = ["/profile"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (!isProtected) return NextResponse.next();

  // Presence-only check of the long-lived refresh token — real verification
  // happens where it matters (backend guards via the BFF proxy), see
  // lib/backend-fetch.ts. The short-lived access token isn't checked here
  // since it naturally expires every ~15min while the user stays logged in.
  const token = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/profile/:path*"],
};
