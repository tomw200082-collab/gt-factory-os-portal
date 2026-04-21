// ---------------------------------------------------------------------------
// Next.js middleware — Supabase session refresh + route gating
//
// Runs on every matched request. Two responsibilities:
//
// 1. Refresh the Supabase session cookie (via updateSupabaseSession) so that
//    downstream server components see a fresh access_token.
// 2. Redirect unauthenticated requests for gated routes to /login.
//
// Gated paths in v1: everything except the allow-list below. Allow-list:
//   - /login           (sign-in form)
//   - /auth/callback   (magic-link code exchange)
//   - Next.js internals (_next/**, favicon, static assets)
//
// The fake-session flow (when NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH === "true")
// bypasses this redirect entirely. Pages rely on the SessionProvider for role
// display and the fake-session header scheme for local dev.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/auth/callback")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname.startsWith("/api/auth")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  // Dev-shim bypass: when the fake-session flag is on, skip Supabase entirely
  // and let the existing local dev flow work.
  if (process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH === "true") {
    return NextResponse.next({ request });
  }

  const { response, user } = await updateSupabaseSession(request);

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Run on everything except Next.js internals and static assets. The
  // isPublicPath check inside middleware() does the fine-grained filtering.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
