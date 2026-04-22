"use client";

// ---------------------------------------------------------------------------
// Root-level error boundary.
//
// Catches errors that occur inside `app/layout.tsx` itself — e.g. if
// SessionProvider, QueryProvider, or the font loader throws. Because the
// root layout is the thing that crashed, this component MUST render its own
// <html> + <body>. No app shell, no providers; just a static recovery page.
//
// Reached only when `app/error.tsx` cannot absorb the error (layout-level
// crash). Rare but must not leave the user on a blank white page.
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import { reportError } from "@/lib/obs/report";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { boundary: "global" });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
          backgroundColor: "#fafafa",
          color: "#0b0c0e",
          margin: 0,
          padding: "2rem 1rem",
          minHeight: "100vh",
        }}
      >
        <div
          role="alert"
          data-testid="global-error"
          style={{
            maxWidth: "36rem",
            margin: "0 auto",
            borderRadius: "0.5rem",
            border: "1px solid #dc2626",
            backgroundColor: "#fef2f2",
            padding: "1.5rem",
          }}
        >
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            Portal shell crashed.
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#404040" }}>
            The app wrapper itself couldn&apos;t render. This is unusual — it
            typically means a provider (session, data, fonts) failed to
            initialise. Reloading the page usually clears it.
          </p>
          <pre
            style={{
              marginTop: "0.75rem",
              padding: "0.5rem 0.75rem",
              backgroundColor: "#ffffff",
              border: "1px solid #fca5a5",
              borderRadius: "0.25rem",
              fontFamily:
                'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
              fontSize: "0.75rem",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {error.message}
            {error.digest ? `\nsupport code: ${error.digest}` : ""}
          </pre>
          <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: "0.5rem 0.875rem",
                borderRadius: "0.375rem",
                border: "1px solid #0b0c0e",
                backgroundColor: "#0b0c0e",
                color: "#ffffff",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: "0.5rem 0.875rem",
                borderRadius: "0.375rem",
                border: "1px solid #d4d4d8",
                backgroundColor: "#ffffff",
                color: "#0b0c0e",
                fontSize: "0.875rem",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
