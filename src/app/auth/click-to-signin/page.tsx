// ---------------------------------------------------------------------------
// Click-to-sign-in wrapper — WhatsApp-safe magic-link delivery.
//
// Why this page exists:
// Magic links from Supabase (/auth/v1/verify?token=...) are single-use and
// get consumed on the first GET request. When you paste such a URL into a
// chat app (WhatsApp, Telegram, iMessage with link previews, Slack, etc.)
// the app's preview crawler fetches the URL to build the thumbnail — and
// that fetch consumes the token before the human can click. The recipient
// then sees "Email link is invalid or has expired" on first tap.
//
// Delivery contract:
//   /auth/click-to-signin?to=<base64url-encoded magic link>
//
// The encoded URL is decoded on the client only — preview crawlers that
// don't execute JavaScript see no link to follow, so the magic-link is
// preserved for the real user click.
//
// Allow-list: only Supabase /auth/v1/verify URLs to this project's host
// are accepted, to prevent open-redirect abuse.
// ---------------------------------------------------------------------------

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const ALLOWED_ORIGIN = "https://rvadsozabmxkkrktwgnv.supabase.co";
const ALLOWED_PATH_PREFIX = "/auth/v1/verify";

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64);
}

export default function ClickToSigninPage() {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowFallback(true), 6000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    try {
      const raw = new URL(window.location.href).searchParams.get("to");
      if (!raw) {
        setError("Missing destination.");
        return;
      }

      let decoded: string;
      try {
        decoded = base64UrlDecode(raw);
      } catch {
        setError("Invalid destination encoding.");
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(decoded);
      } catch {
        setError("Invalid destination URL.");
        return;
      }

      if (parsed.origin !== ALLOWED_ORIGIN) {
        setError("Destination not allowed.");
        return;
      }
      if (!parsed.pathname.startsWith(ALLOWED_PATH_PREFIX)) {
        setError("Destination not allowed.");
        return;
      }

      setLink(decoded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-lg border border-border/70 bg-bg-elevated p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-fg-strong">
          Sign in to GT Factory OS
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Tap the button below to complete sign-in. The link is single-use.
        </p>

        {error && (
          <>
            <div className="mt-6 rounded border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg">
              {error}
            </div>
            <Link
              href="/login"
              className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
            >
              Go to sign in →
            </Link>
          </>
        )}

        {!error && !link && (
          <>
            <p className="mt-6 text-xs text-fg-muted">Preparing your link…</p>
            {showFallback && (
              <Link
                href="/login"
                className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
              >
                Go to sign in →
              </Link>
            )}
          </>
        )}

        {link && (
          <a
            href={link}
            rel="noreferrer noopener"
            className="mt-6 inline-block w-full rounded-md bg-accent px-4 py-3 text-sm font-medium text-accent-fg hover:bg-accent/90"
          >
            Continue to sign in →
          </a>
        )}

        <p className="mt-6 text-xs text-fg-subtle">
          GT Everyday — Operations portal
        </p>
      </div>
    </div>
  );
}
