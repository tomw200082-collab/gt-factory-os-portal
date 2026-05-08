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
  return createBrowserClient(url, anonKey, {
    auth: {
      // Implicit flow avoids storing a PKCE code_verifier in the browser. PKCE
      // requires the magic link to be opened in the exact same browser that
      // requested it — which breaks whenever Gmail or a mobile email client
      // opens the link in a different browser context. Implicit flow delivers
      // access_token + refresh_token in the URL hash instead; the callback page
      // at /auth/callback already handles this branch. Safe for an internal
      // factory portal without a public redirect-intercept risk.
      flowType: "implicit",
    },
  });
}
