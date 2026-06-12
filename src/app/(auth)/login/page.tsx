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
//
// Conforms to docs/portal_ux_standard.md (Gate 4.2): English-only, LTR,
// state hygiene (loading/error/sent/idle are mutually exclusive), and the
// jargon-free language lexicon. The split-panel hero (tranche 038) is
// presentational; all auth logic and data-testids are unchanged.
// ---------------------------------------------------------------------------

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Mail, KeyRound, Check } from "lucide-react";
import { createSupabaseBrowserClient, createSupabaseOtpClient } from "@/lib/supabase/client";

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

// ---------------------------------------------------------------------------
// LoginHero — presentational only. The dark brand panel from the GT Factory OS
// Design System ("Operational Precision") split-panel sign-in. Pure markup +
// existing Tailwind tokens; no state, no logic, no data. Rendered only on
// lg+ screens (the shell hides it below that) so mobile keeps the centred-card
// experience byte-for-byte.
// ---------------------------------------------------------------------------
const HERO_CAPABILITIES = [
  "Inventory Flow — 14-day visual horizon",
  "Live planning runs · BOM tracking",
  "Approvals inbox · exception alerts",
] as const;

// Fixed palette for the permanently-dark hero. The panel reads the same in
// light and dark theme (it is a brand surface, not a themed surface), so it
// uses fixed colours rather than theme-aware tokens — the same approach the
// resilient root landing page (src/app/page.tsx) takes for its dark hero, and
// the values the design-system handoff specifies. Petrol-teal accent matches
// the dark-theme --accent token (hsl 186 50% 50%).
const HERO = {
  surface: "hsl(30 12% 9%)",
  text: "hsl(42 18% 92%)",
  textMuted: "hsl(42 8% 62%)",
  textFaint: "hsl(42 6% 42%)",
  teal: "hsl(186 50% 52%)",
} as const;

function LoginHero() {
  return (
    <div
      className="relative hidden overflow-hidden lg:flex lg:w-[42%] lg:shrink-0"
      style={{ backgroundColor: HERO.surface }}
    >
      {/* Warm dot-grid texture — the signature paper grain, lifted onto the
          dark panel at low opacity. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, hsl(0 0% 100% / 0.06) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />
      {/* Petrol-teal glow blob — the one place the brand lets a gradient sing. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-[28%] h-[28rem] w-[28rem] rounded-full"
        style={{
          background:
            "radial-gradient(circle, hsl(186 55% 46% / 0.22) 0%, transparent 62%)",
        }}
      />
      <div className="relative flex h-full w-full flex-col justify-between gap-10 p-12">
        {/* Brand */}
        <div className="flex items-center gap-3.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo.png"
            alt="GT Everyday"
            width={44}
            height={44}
            className="h-11 w-11 object-contain"
          />
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tightish" style={{ color: HERO.text }}>
              GT Factory OS
            </div>
            <div
              className="mt-1 text-3xs font-semibold uppercase tracking-sops"
              style={{ color: HERO.textMuted }}
            >
              Operations portal
            </div>
          </div>
        </div>

        {/* Promise + capability ticks */}
        <div>
          <div
            aria-hidden
            className="login-hero-rule mb-5 h-0.5 w-12 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${HERO.teal}, hsl(186 55% 64%))`,
            }}
          />
          <div
            className="text-[1.75rem] font-bold leading-tight tracking-tighter"
            style={{ color: HERO.text }}
          >
            Every shift,
            <br />
            every decision —
            <br />
            <span style={{ color: HERO.teal }}>in one view.</span>
          </div>
          <ul className="mt-6 flex flex-col gap-2.5">
            {HERO_CAPABILITIES.map((cap) => (
              <li
                key={cap}
                className="flex items-center gap-2.5 text-xs"
                style={{ color: HERO.textMuted }}
              >
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: "hsl(186 50% 50% / 0.15)",
                    border: "1px solid hsl(186 50% 50% / 0.3)",
                  }}
                >
                  <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden style={{ color: HERO.teal }} />
                </span>
                {cap}
              </li>
            ))}
          </ul>
        </div>

        {/* Surface footer — brand eyebrow. Per the Portal UX Standard (§1) we
            avoid system-internal terms here (e.g. "Window 2"); the company
            wordmark is the on-brand, jargon-free choice. */}
        <div
          className="font-mono text-3xs uppercase tracking-sops"
          style={{ color: HERO.textFaint }}
        >
          GT Everyday
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoginShell — two-column layout: the presentational hero (lg+ only) beside
// the sign-in content. On small screens the hero is hidden and `children`
// render exactly as the previous centred card did. Presentation only.
// ---------------------------------------------------------------------------
function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    // dir="ltr" per Portal UX Standard §2 — this new wrapper sets direction
    // explicitly so it can never inherit RTL from a parent surface.
    <div dir="ltr" className="flex min-h-screen w-full">
      <LoginHero />
      <div className="flex min-h-screen flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
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

  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [, setSentAt] = useState<Date | null>(null);
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
      return createSupabaseOtpClient();
    } catch (err) {
      return err instanceof Error ? err : new Error(String(err));
    }
  }, []);

  // Separate client for password sign-in. signInWithPassword needs cookie-based
  // session persistence so the middleware can read the session; the OTP client
  // is configured persistSession:false and would lose the session immediately.
  const passwordClient = useMemo(() => {
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

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordClient instanceof Error) {
      setStatus("error");
      setError(passwordClient.message);
      return;
    }
    setStatus("submitting");
    setError(null);

    const { error: signInError } = await passwordClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setStatus("error");
      setError(signInError.message);
      return;
    }

    // Full reload so the server middleware picks up the new session cookies
    // and routes correctly to the dashboard / requested redirect.
    window.location.href = redirectTo;
  }

  function switchToPasswordMode() {
    setMode("password");
    setStatus("idle");
    setError(null);
  }

  function switchToMagicMode() {
    setMode("magic");
    setStatus("idle");
    setError(null);
    setPassword("");
  }

  const gmailLink = gmailDeepLink(email);

  // Block the form when we cannot reach Supabase at all. urlError is from a
  // prior callback failure and is informational; it does not block the form.
  const formBlocked = envError !== null;

  return (
    <LoginShell>
      {/* Brand mark above the card. White-on-transparent logo asset; the
          `invert dark:invert-0` Tailwind pair flips to black-on-light in
          light theme. Same convention as TopBar.BrandMark. Hidden on lg+
          where the split-panel hero already carries the brand. */}
      <div className="mb-6 flex flex-col items-center gap-2 lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo.png"
          alt="GT Everyday"
          width={48}
          height={48}
          className="h-12 w-12 object-contain invert dark:invert-0"
        />
        <div className="text-center leading-tight">
          <div className="text-base font-semibold tracking-tightish text-fg-strong">
            GT Factory OS
          </div>
          <div className="mt-0.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Operations portal
          </div>
        </div>
      </div>
      <div className="card p-6">
        <div className="text-lg font-semibold">Sign in</div>
        <p className="mt-1 text-sm text-fg-muted">
          {mode === "password"
            ? "Enter your email and password. Only approved GT Factory OS users can sign in."
            : "Enter your email and we’ll send you a magic link. Only approved GT Factory OS users can sign in; unknown email addresses will not receive a link."}
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
        ) : mode === "password" ? (
          <form className="mt-4 space-y-3" onSubmit={handlePasswordSubmit}>
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
              />
            </label>
            <label className="block text-sm">
              <span className="text-fg">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={status === "submitting" || formBlocked}
                className="mt-1 block w-full rounded border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="••••••••"
                data-testid="login-password-input"
                aria-describedby={status === "error" && error ? "login-error-msg" : undefined}
              />
            </label>

            {status === "error" && error && (
              <div
                id="login-error-msg"
                role="alert"
                aria-live="polite"
                className="rounded border border-danger/40 bg-danger-softer p-3 text-xs text-danger-fg"
                data-testid="login-password-error"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={
                status === "submitting" ||
                formBlocked ||
                email.trim().length === 0 ||
                password.length === 0
              }
              className="btn btn-primary w-full justify-center"
              data-testid="login-password-submit"
            >
              {status === "submitting"
                ? "Signing in…"
                : formBlocked
                ? "Auth service unavailable"
                : "Sign in"}
            </button>

            <button
              type="button"
              onClick={switchToMagicMode}
              className="mt-1 block w-full text-center text-xs text-accent underline-offset-2 hover:underline"
              data-testid="login-switch-to-magic"
            >
              <Mail className="mr-1 inline h-3 w-3" strokeWidth={2} />
              Use a magic link instead
            </button>
          </form>
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

            <button
              type="button"
              onClick={switchToPasswordMode}
              className="mt-1 block w-full text-center text-xs text-accent underline-offset-2 hover:underline"
              data-testid="login-switch-to-password"
            >
              <KeyRound className="mr-1 inline h-3 w-3" strokeWidth={2} />
              Sign in with a password instead
            </button>
          </form>
        )}
      </div>
      {/* Footer: small print under the card. Confirms the operator hasn't
          landed on a phishing clone, identifies the portal/version, and
          gives a path to a status page if something is broken. */}
      <div className="mt-4 flex items-center justify-center gap-3 text-3xs text-fg-faint">
        <span>GT Factory OS</span>
        <span aria-hidden>·</span>
        <Link
          href="/auth/signout"
          className="hover:text-fg-muted hover:underline"
        >
          Sign out
        </Link>
        <span aria-hidden>·</span>
        <Link
          href="/"
          className="hover:text-fg-muted hover:underline"
        >
          Back to portal
        </Link>
      </div>
    </LoginShell>
  );
}
