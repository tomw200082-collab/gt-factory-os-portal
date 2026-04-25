"use client";

// ---------------------------------------------------------------------------
// Sign out page — handles Supabase sign-out and redirects to /login.
// Renders without the app shell (no TopBar or SideNav).
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const DEV_SHIM_ON = process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH === "true";

export default function SignOutPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"signing-out" | "done" | "error">(
    "signing-out",
  );

  useEffect(() => {
    if (DEV_SHIM_ON) {
      // Dev-shim: no real session; just redirect to the landing page.
      router.replace("/");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .signOut()
      .then(() => {
        setStatus("done");
        router.replace("/login");
      })
      .catch(() => {
        setStatus("error");
      });
  }, [router]);

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
      <div style={{ textAlign: "center" }}>
        {status === "signing-out" && (
          <p style={{ fontSize: "0.9375rem", color: "#a1a1aa" }}>
            Signing out…
          </p>
        )}
        {status === "done" && (
          <p style={{ fontSize: "0.9375rem", color: "#a1a1aa" }}>
            Signed out. Redirecting…
          </p>
        )}
        {status === "error" && (
          <>
            <p style={{ fontSize: "0.9375rem", color: "#f87171" }}>
              Sign out failed.
            </p>
            <a
              href="/login"
              style={{
                display: "inline-block",
                marginTop: "1rem",
                fontSize: "0.875rem",
                color: "#f6f7f8",
                textDecoration: "underline",
              }}
            >
              Go to sign in →
            </a>
          </>
        )}
      </div>
    </main>
  );
}
