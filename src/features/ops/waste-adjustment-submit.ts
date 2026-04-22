"use client";

// ---------------------------------------------------------------------------
// Waste / Adjustment submit pipeline.
//
// Mirrors the goods-receipt-submit pattern. Handles both the 201 auto-post
// and 202 pending-approval outcomes distinctly. Backend contract mirror:
//   C:/Users/tomw2/Projects/window2-portal-sandbox/src/lib/contracts/waste-adjustments.ts
// Authoritative source of truth:
//   C:/Users/tomw2/Projects/gt-factory-os/api/src/waste-adjustments/schemas.ts
//
// Authored under W2 Mode B, scoped to WasteAdjustment only, after
// RUNTIME_READY(Waste) emission 2026-04-17.
// ---------------------------------------------------------------------------

import { useCallback, useRef, useState } from "react";
import type {
  WasteAdjustmentRequest,
  WasteAdjustmentCommittedResponse,
  WasteAdjustmentPendingResponse,
  WasteConflictResponse,
  WasteValidationResponse,
  ItemType,
} from "@/lib/contracts/waste-adjustments";
import type { Session } from "@/lib/auth/fake-auth";

export type SubmitResult =
  | { kind: "committed"; body: WasteAdjustmentCommittedResponse }
  | { kind: "pending"; body: WasteAdjustmentPendingResponse }
  | { kind: "conflict"; body: WasteConflictResponse }
  | { kind: "validation"; body: WasteValidationResponse }
  | { kind: "auth"; statusCode: 401 | 403; message?: string }
  | { kind: "network"; attempts: number; lastError: string };

export type SubmitStatus = "idle" | "submitting" | "retrying" | "done";

export interface WasteFormValues {
  event_at: string;             // datetime-local or ISO
  direction: "loss" | "positive";
  item_id: string;
  quantity: number;
  unit: string;
  reason_code: string;
  notes?: string;
}

export type ItemTypeResolver = (item_id: string) => ItemType | null;

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `wa_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function toIsoDateTime(value: string): string {
  return new Date(value).toISOString();
}

export function buildWasteEnvelope(
  form: WasteFormValues,
  idempotencyKey: string,
  resolveItemType: ItemTypeResolver,
): WasteAdjustmentRequest {
  const resolved = resolveItemType(form.item_id);
  const item_type: ItemType = resolved ?? "RM";
  return {
    idempotency_key: idempotencyKey,
    event_at: toIsoDateTime(form.event_at),
    direction: form.direction,
    item_type,
    item_id: form.item_id,
    quantity: form.quantity,
    unit: form.unit,
    reason_code: form.reason_code,
    notes: form.notes && form.notes !== "" ? form.notes : null,
  };
}

type AttemptDisposition =
  | { kind: "committed"; body: WasteAdjustmentCommittedResponse }
  | { kind: "pending"; body: WasteAdjustmentPendingResponse }
  | { kind: "conflict"; body: WasteConflictResponse }
  | { kind: "validation"; body: WasteValidationResponse }
  | { kind: "auth"; statusCode: 401 | 403; message?: string }
  | { kind: "retriable"; reason: string }
  | { kind: "terminal"; statusCode: number; body: unknown };

async function postOnce(
  envelope: WasteAdjustmentRequest,
  _session: Session,
  signal: AbortSignal,
): Promise<AttemptDisposition> {
  let res: Response;
  try {
    res = await fetch("/api/waste-adjustments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(envelope),
      signal,
    });
  } catch (err) {
    return { kind: "retriable", reason: err instanceof Error ? err.message : String(err) };
  }

  const status = res.status;
  let body: unknown = undefined;
  try { body = await res.json(); } catch { /* non-JSON body */ }

  // 201 auto-post OR idempotent replay → committed
  if (typeof body === "object" && body !== null && (body as { status?: unknown }).status === "posted") {
    return { kind: "committed", body: body as WasteAdjustmentCommittedResponse };
  }
  // 202 pending → distinct UI state (banner: "awaiting planner approval")
  if (status === 202 && typeof body === "object" && body !== null && (body as { status?: unknown }).status === "pending") {
    return { kind: "pending", body: body as WasteAdjustmentPendingResponse };
  }
  if (status === 409 && typeof body === "object" && body !== null && "reason_code" in body) {
    return { kind: "conflict", body: body as WasteConflictResponse };
  }
  if (status === 422 && typeof body === "object" && body !== null && "validation_errors" in body) {
    return { kind: "validation", body: body as WasteValidationResponse };
  }
  if (status === 401 || status === 403) {
    const msg = typeof body === "object" && body !== null && "error" in body
      ? String((body as { error: unknown }).error) : undefined;
    return { kind: "auth", statusCode: status, message: msg };
  }
  if (status >= 500) {
    // Diagnostic surface: when the API returns 5xx, prefer the body's
    // `message` or `detail` over bare `HTTP <status>`. Fastify's default
    // error handler returns { statusCode, error, message } on unhandled
    // exceptions; the portal proxy's catch block returns { error, detail }
    // on fetch-throw. Surfacing either makes the Try-again UI show the
    // actual crash cause instead of masking it as a generic network fault.
    let tail = "";
    if (typeof body === "object" && body !== null) {
      const b = body as { message?: unknown; detail?: unknown; error?: unknown };
      const msg = typeof b.message === "string" ? b.message
                : typeof b.detail === "string" ? b.detail
                : typeof b.error === "string" ? b.error
                : "";
      if (msg) tail = `: ${msg}`;
    }
    return { kind: "retriable", reason: `HTTP ${status}${tail}` };
  }
  return { kind: "terminal", statusCode: status, body };
}

const RETRY_DELAYS_MS = [1000, 2000, 4000];

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    signal.addEventListener("abort", onAbort);
  });
}

export interface UseWasteAdjustmentSubmit {
  submit: (form: WasteFormValues, session: Session, resolveItemType: ItemTypeResolver) => Promise<SubmitResult>;
  status: SubmitStatus;
  lastResult: SubmitResult | null;
  reset: () => void;
}

export function useWasteAdjustmentSubmit(): UseWasteAdjustmentSubmit {
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [lastResult, setLastResult] = useState<SubmitResult | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const submit = useCallback(
    async (form: WasteFormValues, session: Session, resolveItemType: ItemTypeResolver): Promise<SubmitResult> => {
      // Stable idempotency key across retries within this submission
      if (!idempotencyKeyRef.current) idempotencyKeyRef.current = newIdempotencyKey();
      const envelope = buildWasteEnvelope(form, idempotencyKeyRef.current, resolveItemType);

      const controller = new AbortController();
      setStatus("submitting");

      let attempts = 0;
      let lastError = "";
      for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
        attempts = i + 1;
        const disp = await postOnce(envelope, session, controller.signal);

        if (disp.kind === "committed" || disp.kind === "pending" || disp.kind === "conflict"
            || disp.kind === "validation" || disp.kind === "auth") {
          const result: SubmitResult = disp;
          setLastResult(result);
          setStatus("done");
          idempotencyKeyRef.current = null; // fresh key for next logical submission
          return result;
        }
        if (disp.kind === "terminal") {
          const result: SubmitResult = { kind: "network", attempts, lastError: `HTTP ${disp.statusCode}` };
          setLastResult(result);
          setStatus("done");
          idempotencyKeyRef.current = null;
          return result;
        }
        // retriable
        lastError = disp.reason;
        if (i < RETRY_DELAYS_MS.length) {
          setStatus("retrying");
          await sleepWithAbort(RETRY_DELAYS_MS[i], controller.signal);
        }
      }
      const result: SubmitResult = { kind: "network", attempts, lastError };
      setLastResult(result);
      setStatus("done");
      idempotencyKeyRef.current = null;
      return result;
    },
    [],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setLastResult(null);
    idempotencyKeyRef.current = null;
  }, []);

  return { submit, status, lastResult, reset };
}
