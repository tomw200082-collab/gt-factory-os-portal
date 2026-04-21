// ---------------------------------------------------------------------------
// Supabase server client
//
// Used by server components, route handlers, and server actions. Reads the
// Supabase session from Next.js's request cookies and, when the session token
// is refreshed on the server side, writes the new cookies back onto the
// response via the provided cookies() accessor.
//
// Contract boundary: never import this from a "use client" module. Use
// ./client.ts for browser code.
//
// Usage:
//   const supabase = await createSupabaseServerClient();
//   const { data: { session } } = await supabase.auth.getSession();
//   const jwt = session?.access_token;
//
// The access_token is the JWT that must be forwarded to the GT Factory OS API
// as Authorization: Bearer <jwt>.
// ---------------------------------------------------------------------------

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // set() can throw in server components during render (Next.js 15
          // only permits cookie mutation in route handlers / server actions).
          // The middleware refreshes cookies on every request so a failed
          // write here is non-fatal.
        }
      },
    },
  });
}
