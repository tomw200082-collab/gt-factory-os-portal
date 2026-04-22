// ---------------------------------------------------------------------------
// Public landing (Tranche 018).
//
// Serves as the always-visible entry point to the portal. Does NOT depend
// on Supabase, middleware role-gate, or any session state. If you can see
// this page, the Vercel deploy is healthy at the build + runtime level;
// the auth chain (/dashboard → middleware → /login → Supabase) is a
// separate layer and its failure no longer blocks first paint.
//
// Before T018 this page was `redirect("/dashboard")`, which triggered a
// multi-hop chain that rendered nothing visible if any link in the chain
// failed. Operators reported "the preview URL doesn't open". This page
// replaces the silent redirect with a concrete "the deploy works, click
// to sign in" affordance — and a small build+env footer so the operator
// can confirm WHICH version they're looking at at a glance.
// ---------------------------------------------------------------------------

import Link from "next/link";

export const dynamic = "force-dynamic";

export default function RootLandingPage() {
  const commitSha =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_COMMIT_SHA ??
    null;
  const shortSha = commitSha ? commitSha.slice(0, 7) : null;
  const deployEnv = process.env.VERCEL_ENV ?? null;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
        backgroundColor: "#0b0c0e",
        color: "#f6f7f8",
        fontFamily:
          'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      }}
    >
      <div style={{ maxWidth: "28rem", textAlign: "center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.25rem 0.75rem",
            borderRadius: "9999px",
            backgroundColor: "rgba(34,197,94,0.12)",
            border: "1px solid rgba(34,197,94,0.35)",
            fontSize: "0.6875rem",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#86efac",
            marginBottom: "1.5rem",
          }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: "0.5rem",
              height: "0.5rem",
              borderRadius: "9999px",
              backgroundColor: "#22c55e",
            }}
          />
          Portal online
        </div>

        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 700,
            letterSpacing: "-0.015em",
            margin: 0,
          }}
        >
          GT Factory OS
        </h1>
        <p
          style={{
            marginTop: "0.5rem",
            fontSize: "0.9375rem",
            lineHeight: 1.55,
            color: "#a1a1aa",
          }}
        >
          Operations portal — master data, operator forms, planning workspaces,
          and the control tower for the factory floor.
        </p>

        <Link
          href="/login?redirectTo=%2Fdashboard"
          style={{
            display: "inline-block",
            marginTop: "1.75rem",
            padding: "0.625rem 1.25rem",
            borderRadius: "0.5rem",
            backgroundColor: "#f6f7f8",
            color: "#0b0c0e",
            fontSize: "0.9375rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
          data-testid="root-sign-in"
        >
          Sign in &rarr;
        </Link>

        {shortSha || deployEnv ? (
          <div
            style={{
              marginTop: "2.5rem",
              fontSize: "0.6875rem",
              color: "#52525b",
              fontFamily:
                'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
            }}
            data-testid="root-deploy-info"
          >
            {shortSha ? <span>build {shortSha}</span> : null}
            {shortSha && deployEnv ? <span> · </span> : null}
            {deployEnv ? <span>{deployEnv}</span> : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
