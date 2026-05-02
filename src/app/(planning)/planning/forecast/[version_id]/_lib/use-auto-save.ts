"use client";

// ---------------------------------------------------------------------------
// Forecast version detail — auto-save hook.
//
// Owner: W2 Mode B-ForecastMonthly-Redesign (Wave 2 chunks 4 + 5 of
// docs/forecast_monthly_cadence_refactor_plan_2026-05-02.md §Task 4.2.2).
//
// Behavior:
//   - queueChange(line) adds / replaces a pending change in a buffer keyed by
//     (item_id, period_bucket_key); duplicate edits to the same cell coalesce.
//   - After `debounceMs` (default 800ms) of inactivity, the buffer flushes via
//     POST /api/forecasts/save-lines (a portal proxy that forwards Bearer JWT
//     to the upstream Fastify mutation handler — same shape as legacy save).
//   - State machine: idle → saving → saved (or → error). UI surfaces the
//     state through AutoSaveIndicator.
//   - flush() on demand for explicit-save paths (e.g., before publish).
//
// Backend contract:
//   POST /api/v1/mutations/forecasts/save-lines
//   body: { version_id, idempotency_key, lines: [{item_id, period_bucket_key,
//          forecast_quantity}] }
//
//   Wave 1 backend (commit 31d3ee0) supports cadence='monthly' bucket keys
//   verbatim. F1 sparse: only existing lines must be filled at publish time.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export interface PendingChange {
  item_id: string;
  period_bucket_key: string;
  forecast_quantity: string; // string-form for qty_8dp precision preservation
}

export type AutoSaveState = "idle" | "saving" | "saved" | "error";

export interface UseAutoSaveResult {
  state: AutoSaveState;
  lastSavedAt: Date | null;
  errorMessage: string | null;
  pendingCount: number;
  /** Queue a change. Coalesces by (item_id, period_bucket_key). */
  queueChange: (change: PendingChange) => void;
  /** Force an immediate flush (e.g., before publish). Returns true on success. */
  flush: () => Promise<boolean>;
  /** Manually clear error after user acknowledges. */
  clearError: () => void;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `fc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

interface SaveLinesErrorBody {
  detail?: string;
  reason_code?: string;
  error?: string;
}

export function useAutoSave(
  versionId: string,
  options: { debounceMs?: number; enabled?: boolean } = {},
): UseAutoSaveResult {
  const { debounceMs = 800, enabled = true } = options;
  const [state, setState] = useState<AutoSaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const pendingRef = useRef<Map<string, PendingChange>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const qc = useQueryClient();

  const flushNow = useCallback(async (): Promise<boolean> => {
    if (pendingRef.current.size === 0) return true;
    if (inFlightRef.current) return false;
    inFlightRef.current = true;

    const batch = Array.from(pendingRef.current.values());
    pendingRef.current = new Map();
    setPendingCount(0);
    setState("saving");

    try {
      const res = await fetch(`/api/forecasts/save-lines`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version_id: versionId,
          idempotency_key: newIdempotencyKey(),
          lines: batch,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        let body: SaveLinesErrorBody = {};
        try {
          body = JSON.parse(txt) as SaveLinesErrorBody;
        } catch {
          /* ignore */
        }
        const detail = body.detail ?? body.error ?? "Auto-save failed.";
        setState("error");
        setErrorMessage(detail);
        // Re-queue the batch so a manual retry / next edit picks it up.
        for (const c of batch) {
          const k = `${c.item_id}|${c.period_bucket_key}`;
          if (!pendingRef.current.has(k)) {
            pendingRef.current.set(k, c);
          }
        }
        setPendingCount(pendingRef.current.size);
        return false;
      }

      setState("saved");
      setLastSavedAt(new Date());
      setErrorMessage(null);
      // Refetch to pick up server-side normalization (e.g., trailing zeros
      // stripped to qty_8dp shape).
      qc.invalidateQueries({ queryKey: ["forecast", "version", versionId] });
      return true;
    } catch (err) {
      setState("error");
      setErrorMessage(err instanceof Error ? err.message : "Auto-save failed.");
      // Re-queue.
      for (const c of batch) {
        const k = `${c.item_id}|${c.period_bucket_key}`;
        if (!pendingRef.current.has(k)) {
          pendingRef.current.set(k, c);
        }
      }
      setPendingCount(pendingRef.current.size);
      return false;
    } finally {
      inFlightRef.current = false;
    }
  }, [versionId, qc]);

  const queueChange = useCallback(
    (change: PendingChange) => {
      if (!enabled) return;
      const k = `${change.item_id}|${change.period_bucket_key}`;
      pendingRef.current.set(k, change);
      setPendingCount(pendingRef.current.size);
      setState((prev) => (prev === "error" ? prev : "idle"));
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flushNow();
      }, debounceMs);
    },
    [debounceMs, enabled, flushNow],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    return flushNow();
  }, [flushNow]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
    setState((prev) => (prev === "error" ? "idle" : prev));
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    state,
    lastSavedAt,
    errorMessage,
    pendingCount,
    queueChange,
    flush,
    clearError,
  };
}
