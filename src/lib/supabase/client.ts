// ---------------------------------------------------------------------------
// Supabase browser clients
//
// Two distinct clients for two distinct purposes:
//
// createSupabaseBrowserClient()  — session management (reading the current
//   session, cookie refresh, signOut). Used by middleware, server components,
//   and the callback/signout pages. Provided by @supabase/ssr which stores
//   auth tokens in cookies for SSR compatibility. NOTE: @supabase/ssr v0.10+
//   hard-codes flowType:"pkce" after spreading any options; you cannot
//   override it here.
//
// createSupabaseOtpClient()  — sends the magic-link OTP email only. Uses
//   @supabase/supabase-js createClient directly so we can set
//   flowType:"implicit". Implicit flow delivers access_token + refresh_token
//   in the URL hash — no code_verifier is stored or required, so the magic
//   link works regardless of which browser or device the user opens it on.
//   The /auth/callback page already handles the hash-fragment branch.
//
// Contract boundary: neither client may be used in a server context.
// Use ./server.ts for server components, route handlers, and actions.
// ---------------------------------------------------------------------------

import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

function getEnvVars() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set.",
    );
  }
  return { url, anonKey };
}

export function createSupabaseBrowserClient() {
  const { url, anonKey } = getEnvVars();
  return createBrowserClient(url, anonKey);
}

export function createSupabaseOtpClient() {
  const { url, anonKey } = getEnvVars();
  // @supabase/supabase-js respects flowType:'implicit' — no code_challenge is
  // sent with the OTP request, so Supabase sends a hash-fragment magic link.
  return createClient(url, anonKey, {
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
