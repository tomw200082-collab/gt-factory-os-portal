"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ensureSeeded } from "./index";
import { LoadingState } from "@/components/feedback/states";

export function SeedGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    ensureSeeded()
      .then(() => mounted && setReady(true))
      .catch((e: unknown) =>
        mounted && setError(e instanceof Error ? e.message : String(e))
      );
    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <div className="card border-danger p-6">
        <div className="text-sm font-semibold text-danger">
          Local store failed to initialize
        </div>
        <div className="mt-1 text-xs text-fg-muted">{error}</div>
      </div>
    );
  }

  if (!ready) return <LoadingState title="Loading…" />;

  return <>{children}</>;
}
