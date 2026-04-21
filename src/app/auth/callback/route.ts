// ---------------------------------------------------------------------------
// Auth callback — GET /auth/callback
//
// Supabase redirects here after the user clicks the magic link in their email.
// The redirect URL carries a `code` query param which this handler exchanges
// for a session. On success, the session cookie is written and the user is
// redirected to the app (dashboard by default, or ?next=<path> if supplied).
//
// Contract reference: docs/production_auth_closure_pack.md — callback
// endpoint must be listed in Supabase Auth uri_allow_list for the production
// portal URL.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    const errorUrl = new URL("/login", origin);
    errorUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(errorUrl);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const errorUrl = new URL("/login", origin);
    errorUrl.searchParams.set("error", "exchange_failed");
    errorUrl.searchParams.set("detail", error.message);
    return NextResponse.redirect(errorUrl);
  }

  return NextResponse.redirect(new URL(next, origin));
}
