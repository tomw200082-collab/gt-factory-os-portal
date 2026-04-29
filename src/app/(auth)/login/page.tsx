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
import { Suspense, useEffect, useMemo, useState } from "react";
import { Mail } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const DEV_SHIM_ON = process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH === "true";

// Cooldown after sending/resending a magic link. Prevents accidental
// double-tap rapid-fire and signals "we did send it; give it a sec".
const RESEND_COOLDOWN_SECONDS = 30;

function gmailDeepLink(email: string): string | null {
  // If the email is a Gmail / Google Workspace address, deep-link to the
  // user's inbox in the right account context. For other providers we cannot
  // reliably deep-link, so return null and the UI hides the button.
  const lower = email.toLowerCase().trim();
  if (lower.endsWith("@gmail.com") || lower.endsWith("@googlemail.com") || lower.endsWith("@gteveryday.com")) {
    return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(lower)}`;
  }
  return null;
}

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

// Map known Supabase / OAuth-callback error codes to operator-facing copy.
// Falls back to a generic message when the code isn't recognized so we never
// show a raw machine string to the user. The "detail" suffix from the URL is
// preserved as small print for support / triage.
function explainCallbackError(code: string, detail?: string | null): {
  title: string;
  body: string;
} {
  const c = code.toLowerCase();
  if (c === "access_denied" || c.includes("denied")) {
    return {
      title: "The sign-in link is no longer valid",
      body:
        "It may have expired or already been used. Magic links work once and time out after about an hour. Request a fresh one below.",
    };
  }
  if (c.includes("expired") || c === "otp_expired") {
    return {
      title: "The link expired",
      body: "Magic links expire after about an hour. Request a fresh one below.",
    };
  }
  if (c.includes("used") || c === "otp_consumed") {
    return {
      title: "That link was already used",
      body:
        "Each magic link can only be used once. Request a fresh one below.",
    };
  }
  if (c.includes("flow_state") || c.includes("pkce")) {
    return {
      title: "Open the link in the same browser that requested it",
      body:
        "For security, each magic link is bound to the browser session that asked for it. Request a new link from this device and click it here.",
    };
  }
  if (c.includes("server") || c.includes("unavailable")) {
    return {
      title: "The auth service is temporarily unavailable",
      body:
        "We couldn't complete sign-in. Wait a moment and try again. If this keeps happening, contact the admin.",
    };
  }
  return {
    title: "Sign-in failed",
    body: detail
      ? `${code} — ${detail}. Request a fresh link below.`
      : `${code}. Request a fresh link below.`,
  };
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
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // Tick down the resend cooldown every second when active.
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const supabase = useMemo(() => {
    try {
      return createSupabaseBrowserClient();
    } catch (err) {
      return err instanceof Error ? err : new Error(String(err));
    }
  }, []);

  const envError = supabase instanceof Error ? supabase.message : null;

  async function sendMagicLink(targetEmail: string): Promise<string | null> {
    if (supabase instanceof Error) return supabase.message;
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(
      redirectTo,
    )}`;
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: { emailRedirectTo: callbackUrl },
    });
    return otpError ? otpError.message : null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (supabase instanceof Error) return;
    setStatus("submitting");
    setError(null);

    const errMsg = await sendMagicLink(email);
    if (errMsg) {
      setStatus("error");
      setError(errMsg);
      return;
    }
    setSentAt(new Date());
    setStatus("sent");
    setCooldownRemaining(RESEND_COOLDOWN_SECONDS);
  }

  async function handleResend() {
    if (!email || isResending || cooldownRemaining > 0) return;
    setIsResending(true);
    setError(null);
    const errMsg = await sendMagicLink(email);
    setIsResending(false);
    if (errMsg) {
      setError(errMsg);
      return;
    }
    setSentAt(new Date());
    setCooldownRemaining(RESEND_COOLDOWN_SECONDS);
  }

  function handleUseDifferentEmail() {
    setStatus("idle");
    setError(null);
    setSentAt(null);
    setCooldownRemaining(0);
  }

  const gmailLink = gmailDeepLink(email);

  // Block the form when we cannot reach Supabase at all. urlError is from a
  // prior callback failure and is informational; it does not block the form.
  const formBlocked = envError !== null;

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
            data-testid="login-env-error"
          >
            <div className="font-semibold">Configuration error</div>
            <div className="mt-0.5 text-xs">{envError}</div>
            <div className="mt-1.5 text-xs text-fg-muted">
              The portal can&rsquo;t reach the auth service. Refresh the page;
              if the error persists, contact the admin.
            </div>
          </div>
        )}

        {urlError && status !== "sent" && (() => {
          const explained = explainCallbackError(urlError, urlErrorDetail);
          return (
            <div
              role="alert"
              className="mt-4 rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
              data-testid="login-callback-error"
            >
              <div className="font-semibold">{explained.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-fg-muted">
                {explained.body}
              </div>
              <div className="mt-1.5 font-mono text-3xs uppercase tracking-sops text-fg-faint">
                code: {urlError}
                {urlErrorDetail ? ` · ${urlErrorDetail}` : ""}
              </div>
            </div>
          );
        })()}

        {status === "sent" ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 space-y-3"
            data-testid="login-sent-state"
          >
            <div className="rounded border border-success/40 bg-success-subtle p-3 text-sm text-success-fg">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0" strokeWidth={2} />
                <span className="font-semibold">Check your email</span>
              </div>
              <div className="mt-1 break-words">
                We sent a sign-in link to{" "}
                <span className="font-mono">{email}</span>. It may take up to
                a minute to arrive.
              </div>
              <div className="mt-1.5 text-xs text-fg-muted">
                The link expires in 1 hour and can only be used once.
              </div>
            </div>
            {gmailLink && (
              <a
                href={gmailLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary w-full justify-center"
                data-testid="login-open-gmail"
              >
                <Mail className="h-3.5 w-3.5" strokeWidth={2} />
                Open Gmail
              </a>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <span>Didn&rsquo;t receive it?</span>
              <button
                type="button"
                onClick={handleResend}
                disabled={isResending || cooldownRemaining > 0}
                className="font-medium text-accent underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60 disabled:no-underline"
                data-testid="login-resend"
              >
                {isResending
                  ? "Sending…"
                  : cooldownRemaining > 0
                  ? `Resend in ${cooldownRemaining}s`
                  : "Resend"}
              </button>
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={handleUseDifferentEmail}
                className="font-medium text-accent underline-offset-2 hover:underline"
                data-testid="login-use-different-email"
              >
                Use a different email
              </button>
            </div>
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="rounded border border-danger/40 bg-danger-softer p-2 text-xs text-danger-fg"
                data-testid="login-resend-error"
              >
                {error}
              </div>
            )}
            <div className="text-3xs text-fg-faint">
              Check spam if you don&rsquo;t see it. Sender domain is{" "}
              <span className="font-mono">supabase.co</span>.
            </div>
          </div>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <label className="block text-sm">
              <span className="text-fg">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "submitting" || formBlocked}
                className="mt-1 block w-full rounded border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="you@example.com"
                data-testid="login-email-input"
                aria-describedby={status === "error" && error ? "login-error-msg" : undefined}
              />
            </label>

            {status === "error" && error && (
              <div
                id="login-error-msg"
                role="alert"
                aria-live="polite"
                className="rounded border border-danger/40 bg-danger-softer p-3 text-xs text-danger-fg"
                data-testid="login-otp-error"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "submitting" || formBlocked || email.trim().length === 0}
              className="btn btn-primary w-full justify-center"
              data-testid="login-submit"
            >
              {status === "submitting"
                ? "Sending…"
                : formBlocked
                ? "Auth service unavailable"
                : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
