"use client";

// Movement Log — pause LionWheel FG-out inventory decrements (count window).
//
// Tom 2026-07-02: every Thursday the owner counts finished goods after all
// deliveries leave. LionWheel confirms those deliveries later, so the reconciler
// double-counts them on top of the physical count. This control lets an
// admin/planner freeze delivery-driven stock changes for the counting window.
//
// While paused, deliveries confirmed during the OFF window stay OUT of stock
// permanently (the count already covers them); only deliveries after resume
// decrement. English/LTR — Movement Log is not a Hebrew-exception surface.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session-provider";
import { cn } from "@/lib/cn";

export interface FgOutPauseState {
  paused: boolean;
  since: string | null;
  by: string | null;
  reason: string | null;
}

async function fetchPauseState(): Promise<FgOutPauseState> {
  const res = await fetch("/api/stock/fg-out-pause");
  if (!res.ok) {
    throw new Error(`Pause state request failed (HTTP ${res.status})`);
  }
  return (await res.json()) as FgOutPauseState;
}

async function postPause(
  paused: boolean,
  reason: string,
): Promise<FgOutPauseState> {
  const res = await fetch("/api/stock/fg-out-pause", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paused, reason: reason.trim() || undefined }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Pause toggle failed (HTTP ${res.status})`);
  }
  return (await res.json()) as FgOutPauseState;
}

function formatSince(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FgOutPauseControl() {
  const { session } = useSession();
  const qc = useQueryClient();
  const canToggle = session.role === "admin" || session.role === "planner";

  const { data, isLoading, isError, refetch } = useQuery<FgOutPauseState>({
    queryKey: ["fg-out-pause"],
    queryFn: fetchPauseState,
    staleTime: 15_000,
  });

  // pendingTarget = the state we're asking the user to confirm switching to.
  const [pendingTarget, setPendingTarget] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: (next: boolean) => postPause(next, reason),
    onSuccess: () => {
      setPendingTarget(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["fg-out-pause"] });
      // No ledger-list invalidation: toggling the pause doesn't change existing
      // ledger rows (suppression happens server-side on the next poll), and a
      // broad ["stock-ledger"] key would also refetch the staleTime:Infinity
      // movement-types enum on the page.
    },
  });

  const paused = data?.paused ?? false;

  // Avoid a flash before the first load resolves.
  if (isLoading && !data) return null;
  // Honest unknown-state: if we can't read the pause state, never imply "live"
  // (this is a safety control). Offer a retry to the people who manage the
  // pause; stay quiet for everyone else.
  if (isError && !data) {
    if (!canToggle) return null;
    return (
      <div
        className="rounded-md border border-warning/50 bg-warning-softer/50 px-4 py-3 text-xs text-warning-fg"
        role="alert"
        data-testid="fg-out-pause-load-error"
      >
        Couldn&apos;t load the delivery-stock pause state.{" "}
        <button
          type="button"
          className="font-medium underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          onClick={() => refetch()}
          data-testid="fg-out-pause-retry"
        >
          Retry
        </button>
      </div>
    );
  }
  // Operators/viewers see nothing when not paused (no banner, no control).
  if (!paused && !canToggle) return null;

  const confirmPanel =
    pendingTarget !== null ? (
      <div
        className="mt-2 space-y-2 rounded-md border border-warning/40 bg-warning-softer/40 p-3"
        data-testid="fg-out-pause-confirm"
      >
        <p className="text-2xs text-fg-muted">
          {pendingTarget
            ? "Deliveries confirmed in LionWheel will NOT change stock while paused. They stay excluded from stock after you resume — your count already covers them."
            : "Resuming means deliveries confirmed from now on will reduce stock again. Deliveries during the pause stay excluded."}
        </p>
        <label className="block text-2xs font-semibold text-fg">
          Reason (optional)
          <input
            type="text"
            // Move focus into the panel when it opens (the trigger button
            // unmounts on click), so keyboard/SR users land on the reason field.
            autoFocus
            className="mt-1 w-full rounded border border-border bg-bg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Thursday stock count"
            disabled={mutation.isPending}
            data-testid="fg-out-pause-reason"
          />
        </label>
        {mutation.isError ? (
          <p
            className="text-2xs text-danger-fg"
            role="alert"
            data-testid="fg-out-pause-error"
          >
            {mutation.error instanceof Error
              ? mutation.error.message
              : "Something went wrong."}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(
              "btn btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              pendingTarget ? "btn-danger" : "btn-primary",
            )}
            onClick={() => mutation.mutate(pendingTarget)}
            disabled={mutation.isPending}
            data-testid="fg-out-pause-confirm-btn"
          >
            {mutation.isPending
              ? "Saving…"
              : pendingTarget
                ? "Pause stock updates"
                : "Resume stock updates"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setPendingTarget(null);
              setReason("");
              mutation.reset();
            }}
            disabled={mutation.isPending}
          >
            Cancel
          </button>
        </div>
      </div>
    ) : null;

  if (paused) {
    // Prominent banner — visible to every role.
    return (
      <div
        className="rounded-md border border-warning/50 bg-warning-softer/60 px-4 py-3 text-sm text-warning-fg"
        data-testid="fg-out-pause-banner"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* aria-live wraps ONLY the status text — not the confirm panel/input
              below — so typing a reason doesn't re-announce the banner. */}
          <div className="min-w-0" role="status" aria-live="polite">
            <div className="flex items-center gap-1.5 font-semibold">
              <span aria-hidden>⏸</span>
              Delivery stock updates are paused
            </div>
            <p className="mt-1 text-xs text-fg-muted">
              Deliveries in LionWheel won&apos;t change stock levels until this is
              turned back on
              {data?.since ? ` · paused ${formatSince(data.since)}` : ""}
              {data?.by ? ` by ${data.by}` : ""}.
            </p>
          </div>
          {canToggle && pendingTarget === null ? (
            <button
              type="button"
              className="btn btn-sm border-warning/50 text-warning-fg hover:bg-warning-softer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              onClick={() => setPendingTarget(false)}
              data-testid="fg-out-pause-resume-open"
            >
              Resume stock updates
            </button>
          ) : null}
        </div>
        {confirmPanel}
      </div>
    );
  }

  // Not paused + admin/planner: the subtle "pause" affordance.
  return (
    <div
      className="rounded-md border border-border/70 bg-bg-subtle/30 px-4 py-3 text-sm"
      data-testid="fg-out-pause-control"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-muted">
          Doing a stock count? Pause delivery-driven stock changes so shipments
          already loaded in LionWheel don&apos;t throw off your counts.
        </p>
        {pendingTarget === null ? (
          <button
            type="button"
            className="btn btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            onClick={() => setPendingTarget(true)}
            data-testid="fg-out-pause-open"
          >
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>⏸</span>
              Pause stock changes from deliveries
            </span>
          </button>
        ) : null}
      </div>
      {confirmPanel}
    </div>
  );
}
