// ---------------------------------------------------------------------------
// Supabase middleware helper
//
// Called from src/middleware.ts on every request. Refreshes the Supabase
// session cookie if it is close to expiry so that server components and route
// handlers see a fresh access_token in cookies().
//
// Does NOT perform route-level auth gating in this file. Route protection
// (redirect to /login when no session) is performed in src/middleware.ts so
// the redirect logic sits close to the matcher config.
// ---------------------------------------------------------------------------

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Fail open for now — middleware must not 500 the whole app if env vars
    // are missing on a transient deploy. The login page surfaces a clearer
    // error when the browser client instantiates.
    return { response, session: null };
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // IMPORTANT: getUser() triggers the cookie refresh. Do NOT remove.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
