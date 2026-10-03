// Server-side gate for /sales/control (D-045; UX gate P1-1). Imported only by the route's server
// layout, never by a client module, so the email it is decided by never reaches a browser bundle.
//
// The backend is the guard (GET /api/v1/queries/sales/control answers 404 to anyone but Tom).
// This makes the portal answer the same way before any of the page renders: a real 404 with the
// portal's own not-found, identical to an unknown route.
//
// The session email is read the way the API proxy reads the session: from the Supabase cookies.
// With the dev-shim on (local and test only; never on a production deployment), there is no
// server-side session, so the shim's email is read from the gt.devshim.email cookie instead.

import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CONTROL_EMAIL = "tom@gteveryday.com";
export const DEV_SHIM_EMAIL_COOKIE = "gt.devshim.email";

function devShimOn(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH === "true" && process.env.VERCEL_ENV !== "production";
}

export async function sessionEmail(): Promise<string | null> {
  if (devShimOn()) {
    const raw = (await cookies()).get(DEV_SHIM_EMAIL_COOKIE)?.value;
    return raw ? decodeURIComponent(raw) : null;
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

export async function controlAllowed(): Promise<boolean> {
  return ((await sessionEmail()) ?? "").trim().toLowerCase() === CONTROL_EMAIL;
}
