// ---------------------------------------------------------------------------
// Auth callback page — handles BOTH Supabase sign-in flows:
//
// 1. PKCE flow (?code=...): used by the portal's signInWithOtp call from
//    /login. The Supabase JS SDK on the user's browser holds the
//    code_verifier in localStorage; we exchange the code for a session here.
//
// 2. Implicit flow (#access_token=...&refresh_token=...): used when a magic
//    link is generated server-side via Supabase Admin API
//    (POST /auth/v1/admin/generate_link). The Admin endpoint does not
//    accept PKCE parameters and always returns implicit-flow tokens in the
//    URL hash. We must read the hash on the client and call setSession.
//
// Hash fragments are NOT sent to the server, so this MUST be a client
// component. The previous server-side route.ts only handled PKCE and
// rejected implicit-flow magic links with "missing_code".
// ---------------------------------------------------------------------------

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const ranRef = useRef(false);
  const [status, setStatus] = useState<string>("Logging you in…");
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), 10000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    void (async () => {
      const url = new URL(window.location.href);
      const next = url.searchParams.get("next") ?? "/home";

      const supabase = createSupabaseBrowserClient();

      // PKCE flow: ?code=...
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          const failUrl = new URL("/login", window.location.origin);
          failUrl.searchParams.set("error", "exchange_failed");
          failUrl.searchParams.set("detail", error.message);
          router.replace(failUrl.pathname + failUrl.search);
          return;
        }
        router.replace(next);
        return;
      }

      // Implicit flow: hash fragment carries access_token + refresh_token
      // (or an error_description on failure).
      const rawHash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : "";
      const params = new URLSearchParams(rawHash);

      const errorDescription = params.get("error_description");
      if (errorDescription) {
        const failUrl = new URL("/login", window.location.origin);
        failUrl.searchParams.set("error", errorDescription);
        router.replace(failUrl.pathname + failUrl.search);
        return;
      }

      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        setStatus("Establishing session…");
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) {
          const failUrl = new URL("/login", window.location.origin);
          failUrl.searchParams.set("error", "set_session_failed");
          failUrl.searchParams.set("detail", error.message);
          router.replace(failUrl.pathname + failUrl.search);
          return;
        }
        // Hard navigation so middleware re-runs with the freshly-set cookies
        // and the destination page is rendered server-side with the new
        // session in scope.
        window.location.replace(next);
        return;
      }

      // No code, no tokens — likely a stray visit.
      const failUrl = new URL("/login", window.location.origin);
      failUrl.searchParams.set("error", "missing_code");
      router.replace(failUrl.pathname + failUrl.search);
    })();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col items-center text-center">
        <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          GT Factory OS
        </div>
        {timedOut ? (
          <Link
            href="/login"
            className="mt-4 text-sm font-medium text-accent hover:underline"
          >
            Taking longer than expected — return to sign in
          </Link>
        ) : (
          <div className="mt-4 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-fg-muted" />
            <p className="text-sm text-fg-muted">{status}</p>
          </div>
        )}
      </div>
    </div>
  );
}
