// ---------------------------------------------------------------------------
// Supabase browser client
//
// Used by client components and client-side hooks to read the current session,
// call supabase.auth.signInWithOtp({ email, ... }), and receive session
// updates from cookie refreshes performed by the middleware.
//
// Contract boundary: never use this in a server context. Use ./server.ts for
// server components, route handlers, and server actions.
// ---------------------------------------------------------------------------

import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set.",
    );
  }
  return createBrowserClient(url, anonKey);
}
