"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ensureSeeded } from "./index";
import { DB_NAME, DB_VERSION } from "./idb";
import { LoadingState } from "@/components/feedback/states";

function isVersionError(msg: string): boolean {
  return (
    msg.includes("VersionError") ||
    msg.includes("less than the existing version") ||
    msg.includes("requested version")
  );
}

async function clearDbAndReload(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  window.location.reload();
}

export function SeedGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    ensureSeeded()
      .then(() => mounted && setReady(true))
      .catch((e: unknown) =>
        mounted && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    if (isVersionError(error)) {
      return (
        <div className="card border-warning p-6">
          <div className="text-sm font-semibold">
            Local store version mismatch
          </div>
          <div className="mt-1 text-xs text-fg-muted">
            App expects version {DB_VERSION}. Browser IndexedDB mismatch detected. Clearing local data and reloading will fix this — no server data is affected.
          </div>
          <div className="mt-1 text-xs font-mono text-fg-muted">
            DB_VERSION runtime = {DB_VERSION}
          </div>
          <button
            className="mt-3 rounded bg-warning px-3 py-1.5 text-xs font-medium text-warning-foreground"
            onClick={() => void clearDbAndReload()}
          >
            Clear local data and reload
          </button>
        </div>
      );
    }
    return (
      <div className="card border-danger p-6">
        <div className="text-sm font-semibold text-danger">
          Local store failed to initialize
        </div>
        <div className="mt-1 text-xs text-fg-muted">{error}</div>
        <div className="mt-1 text-xs font-mono text-fg-muted">
          DB_VERSION runtime = {DB_VERSION}
        </div>
      </div>
    );
  }

  if (!ready) return <LoadingState title="Loading…" />;

  return <>{children}</>;
}
