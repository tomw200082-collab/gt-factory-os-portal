// ---------------------------------------------------------------------------
// Next.js middleware — Supabase session refresh + route gating
//
// Runs on every matched request. Three responsibilities:
//
// 1. Refresh the Supabase session cookie (via updateSupabaseSession) so that
//    downstream server components see a fresh access_token.
// 2. Redirect unauthenticated requests for gated WEB routes to /login;
//    return 401 JSON for unauthenticated /api/* requests so page-level
//    fetch hooks can categorize the error correctly. (See
//    docs/superpowers/specs/2026-05-02-middleware-401-json-for-api-paths-design.md.)
// 3. (Tranche 016) Path-specific role gating. When user.app_metadata.role
//    is present, enforce a prefix → allow-list check. When it is absent
//    (current backend state — the app_users role is not yet projected into
//    the Supabase JWT app_metadata), middleware falls through and the
//    layout-level RoleGate + upstream JWT-scope continue to enforce. This
//    is defense-in-depth layer 3: ready for backend to populate the claim
//    without any further portal change.
//
// Gated paths in v1: everything except the allow-list below. Allow-list:
//   - /login           (sign-in form)
//   - /auth/callback   (magic-link code exchange)
//   - Next.js internals (_next/**, favicon, static assets)
//
// The dev-shim flow (when NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH === "true")
// bypasses this redirect entirely. Pages rely on the SessionProvider for
// role display and the dev-shim localStorage scheme for local dev.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

// Prefix → allowed-roles table. First-match wins (check more-specific
// prefixes first). Keep aligned with docs/portal-os/route-manifest.json
// and the per-group layout.tsx RoleGate allow-lists.
const ROLE_GATES: Array<{ prefix: string; allow: string[] }> = [
  // More-specific first: /inbox/approvals/* must match before /inbox.
  { prefix: "/inbox/approvals", allow: ["planner", "admin"] },
  { prefix: "/admin", allow: ["admin"] },
  { prefix: "/planning", allow: ["planner", "admin"] },
  { prefix: "/stock", allow: ["operator", "admin"] },
  { prefix: "/purchase-orders", allow: ["planner", "admin", "viewer"] },
  { prefix: "/exceptions", allow: ["planner", "admin", "viewer"] },
  // /inbox, /dashboard, /profile — any authenticated role. Explicitly
  // listed here for documentation; they match nothing above.
];

function findRoleGate(
  pathname: string,
): { prefix: string; allow: string[] } | null {
  for (const gate of ROLE_GATES) {
    if (pathname === gate.prefix || pathname.startsWith(gate.prefix + "/")) {
      return gate;
    }
  }
  return null;
}

function isPublicPath(pathname: string): boolean {
  // Root path is the Tranche 018 public landing — no auth required so the
  // deploy renders something visible even when Supabase env vars are
  // unset in the Vercel environment.
  if (pathname === "/") return true;
  if (pathname === "/login") return true;
  if (pathname.startsWith("/auth/callback")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname.startsWith("/api/auth")) return true;
  return false;
}

function isApiPath(pathname: string): boolean {
  // API routes return JSON, never HTML. Auth/role failures must surface
  // as 401/403 JSON so the page-level fetch hook can categorize them
  // correctly — a 307 redirect to /login would deliver login HTML to a
  // fetch() call that expects JSON, defeating error categorization and
  // surfacing the generic "could not load" copy instead of the auth-aware
  // "your session expired" copy. Spec:
  // docs/superpowers/specs/2026-05-02-middleware-401-json-for-api-paths-design.md
  return pathname.startsWith("/api/");
}

export async function middleware(request: NextRequest) {
  // T019: wrap the entire body in try/catch. Any failure inside
  // updateSupabaseSession (env-var missing, upstream Supabase timeout,
  // unexpected throw) must NOT result in a 500 for the end user — fall
  // back to letting the request through so the target page can render
  // (and show its own error UI if applicable).
  try {
    // Dev-shim bypass: when the fake-session flag is on, skip Supabase
    // entirely and let the existing local dev flow work.
    if (process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH === "true") {
      return NextResponse.next({ request });
    }

    const { response, user } = await updateSupabaseSession(request);

    const { pathname } = request.nextUrl;

    if (!user && !isPublicPath(pathname)) {
      if (isApiPath(pathname)) {
        return NextResponse.json(
          { error: "Not authenticated", code: "session_expired" },
          { status: 401 },
        );
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Tranche 016: path-specific role gating. Only fires when (a) user
    // is authenticated AND (b) app_metadata.role is populated. Today
    // the backend does not project the app_users.role into Supabase JWT
    // app_metadata, so `role` will be undefined and this block is a
    // no-op — existing layout-level RoleGate + upstream 403 remain the
    // active defense. When the backend adds the projection, this code
    // immediately upgrades to a third defense layer.
    if (user) {
      const role = (user.app_metadata as { role?: string } | undefined)?.role;
      if (role) {
        const gate = findRoleGate(pathname);
        if (gate && !gate.allow.includes(role)) {
          if (isApiPath(pathname)) {
            return NextResponse.json(
              { error: "Forbidden", code: "role_forbidden" },
              { status: 403 },
            );
          }
          const forbidden = request.nextUrl.clone();
          forbidden.pathname = "/dashboard";
          forbidden.searchParams.set("forbidden", pathname);
          return NextResponse.redirect(forbidden);
        }
      }
    }

    return response;
  } catch (err) {
    // Never 500 from middleware. Log and pass through.
    // eslint-disable-next-line no-console
    console.error(
      "[middleware] unexpected error; passing through:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.next({ request });
  }
}

export const config = {
  // Run on everything except Next.js internals, static assets, and the
  // root landing page. Excluding `/` at the matcher level (T019) means
  // the landing page is served as pure static HTML with zero middleware
  // — the most bulletproof path for first paint.
  matcher: [
    "/((?!$|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
