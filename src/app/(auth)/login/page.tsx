// ---------------------------------------------------------------------------
// Login page
//
// Two modes, selected by NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH:
//   - "true"  → dev-shim fake-session continue button (pre-cutover local dev)
//   - else    → Supabase magic-link email form (production cutover default)
//
// The Supabase form posts an email to supabase.auth.signInWithOtp. Supabase
// sends a magic-link email to that address; the link redirects to
// /auth/callback which exchanges the code for a session cookie and then
// redirects to /dashboard (or the ?redirectTo query param).
// ---------------------------------------------------------------------------

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const DEV_SHIM_ON = process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH === "true";

export default function LoginPage() {
  if (DEV_SHIM_ON) {
    return <DevShimLogin />;
  }
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <MagicLinkLogin />
    </Suspense>
  );
}

function LoginSkeleton() {
  return (
    <div className="mx-auto mt-16 max-w-md">
      <div className="card p-6">
        <div className="text-lg font-semibold">Sign in</div>
        <p className="mt-1 text-sm text-fg-muted">Loading…</p>
      </div>
    </div>
  );
}

function DevShimLogin() {
  return (
    <div className="mx-auto mt-16 max-w-md">
      <div className="card p-6">
        <div className="text-lg font-semibold">Sign in (dev-shim)</div>
        <p className="mt-1 text-sm text-fg-muted">
          NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true. The portal is running with a fake
          session — switch roles from the chip in the top bar. Set the flag to
          false to test the real Supabase magic-link flow.
        </p>
        <div className="mt-4">
          <Link
            href="/dashboard"
            className="btn btn-primary w-full justify-center"
          >
            Continue with fake session
          </Link>
        </div>
      </div>
    </div>
  );
}

function MagicLinkLogin() {
  const params = useSearchParams();
  const urlError = params.get("error");
  const urlErrorDetail = params.get("detail");
  const redirectTo = params.get("redirectTo") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => {
    try {
      return createSupabaseBrowserClient();
    } catch (err) {
      return err instanceof Error ? err : new Error(String(err));
    }
  }, []);

  const envError = supabase instanceof Error ? supabase.message : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (supabase instanceof Error) return;
    setStatus("submitting");
    setError(null);

    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(
      redirectTo,
    )}`;

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl },
    });

    if (otpError) {
      setStatus("error");
      setError(otpError.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="mx-auto mt-16 max-w-md">
      <div className="card p-6">
        <div className="text-lg font-semibold">Sign in</div>
        <p className="mt-1 text-sm text-fg-muted">
          Enter your email and we&rsquo;ll send you a magic link. Only approved
          GT Factory OS users can sign in; unknown email addresses will not
          receive a link.
        </p>

        {envError && (
          <div
            role="alert"
            className="mt-4 rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
          >
            Configuration error: {envError}
          </div>
        )}

        {urlError && (
          <div
            role="alert"
            className="mt-4 rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
          >
            Sign-in failed: {urlError}
            {urlErrorDetail ? ` — ${urlErrorDetail}` : ""}
          </div>
        )}

        {status === "sent" ? (
          <div
            role="status"
            className="mt-4 rounded border border-success/40 bg-success-subtle p-3 text-sm text-success-fg"
          >
            Check your email ({email}) for a sign-in link. It may take a minute
            to arrive.
          </div>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <label className="block text-sm">
              <span className="text-fg">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "submitting" || envError !== null}
                className="mt-1 block w-full rounded border border-border px-3 py-2 text-sm"
                placeholder="you@example.com"
                data-testid="login-email-input"
              />
            </label>

            {status === "error" && error && (
              <div
                role="alert"
                className="rounded border border-danger/40 bg-danger-softer p-3 text-xs text-danger-fg"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "submitting" || envError !== null}
              className="btn btn-primary w-full justify-center"
              data-testid="login-submit"
            >
              {status === "submitting" ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
