"use client";

// ---------------------------------------------------------------------------
// Physical Count submit pipeline.
//
// Mirrors the waste-adjustment-submit pattern. Handles:
//   - GET /api/physical-count/open  → snapshot_id + blind
//   - POST /api/physical-count      → 201 auto-post OR 202 pending
//   - POST /api/physical-count/:snapshot_id/cancel
//
// Backend contract mirror:
//   C:/Users/tomw2/Projects/window2-portal-sandbox/src/lib/contracts/physical-count.ts
// Authoritative source of truth:
//   C:/Users/tomw2/Projects/gt-factory-os/api/src/physical-counts/schemas.ts
//
// Authored under W2 Mode B, scoped to PhysicalCount only, after
// RUNTIME_READY(PhysicalCount) emission 2026-04-17T19:21:41Z.
// ---------------------------------------------------------------------------

import { useCallback, useRef, useState } from "react";
import type {
  PhysicalCountOpenResponse,
  PhysicalCountCommittedResponse,
  PhysicalCountPendingResponse,
  PhysicalCountConflictResponse,
  PhysicalCountValidationResponse,
  PhysicalCountCancelSuccessResponse,
  PhysicalCountItemType,
  PhysicalCountSubmit,
} from "@/lib/contracts/physical-count";
import type { Session } from "@/lib/auth/fake-auth";

// ---------------------------------------------------------------------------
// Result discriminants
// ---------------------------------------------------------------------------
export type OpenResult =
  | { kind: "opened"; body: PhysicalCountOpenResponse }
  | { kind: "conflict"; body: PhysicalCountConflictResponse }
  | { kind: "validation"; body: PhysicalCountValidationResponse }
  | { kind: "auth"; statusCode: 401 | 403; message?: string }
  | { kind: "network"; attempts: number; lastError: string };

export type SubmitResult =
  | { kind: "committed"; body: PhysicalCountCommittedResponse }
  | { kind: "pending"; body: PhysicalCountPendingResponse }
  | { kind: "conflict"; body: PhysicalCountConflictResponse }
  | { kind: "validation"; body: PhysicalCountValidationResponse }
  | { kind: "auth"; statusCode: 401 | 403; message?: string }
  | { kind: "network"; attempts: number; lastError: string };

export type CancelResult =
  | { kind: "cancelled"; body: PhysicalCountCancelSuccessResponse }
  | { kind: "conflict"; body: PhysicalCountConflictResponse }
  | { kind: "auth"; statusCode: 401 | 403; message?: string }
  | { kind: "network"; message: string };

export type SubmitStatus = "idle" | "submitting" | "retrying" | "done";

export interface PhysicalCountFormValues {
  event_at: string;            // datetime-local or ISO
  counted_quantity: number;
  unit: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function toIsoDateTime(value: string): string {
  return new Date(value).toISOString();
}

function buildSubmitEnvelope(
  form: PhysicalCountFormValues,
  snapshotId: string,
  idempotencyKey: string,
): PhysicalCountSubmit {
  return {
    idempotency_key: idempotencyKey,
    snapshot_id: snapshotId,
    event_at: toIsoDateTime(form.event_at),
    counted_quantity: form.counted_quantity,
    unit: form.unit,
    notes: form.notes && form.notes !== "" ? form.notes : null,
  };
}

// ---------------------------------------------------------------------------
// Response classifier (shared across open/submit/cancel paths).
// Returns a retriable signal on 5xx and a terminal disposition otherwise.
// ---------------------------------------------------------------------------
type AttemptDisposition<TOk> =
  | { kind: "ok"; body: TOk }
  | { kind: "conflict"; body: PhysicalCountConflictResponse }
  | { kind: "validation"; body: PhysicalCountValidationResponse }
  | { kind: "auth"; statusCode: 401 | 403; message?: string }
  | { kind: "retriable"; reason: string }
  | { kind: "terminal"; statusCode: number; body: unknown };

function classify<TOk>(
  res: Response,
  body: unknown,
  okPredicate: (body: unknown, status: number) => body is TOk,
): AttemptDisposition<TOk> {
  const status = res.status;
  if (okPredicate(body, status)) return { kind: "ok", body };
  if (
    status === 409 &&
    typeof body === "object" &&
    body !== null &&
    "reason_code" in body
  ) {
    return { kind: "conflict", body: body as PhysicalCountConflictResponse };
  }
  if (
    status === 422 &&
    typeof body === "object" &&
    body !== null &&
    "validation_errors" in body
  ) {
    return {
      kind: "validation",
      body: body as PhysicalCountValidationResponse,
    };
  }
  if (status === 401 || status === 403) {
    const msg =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : undefined;
    return { kind: "auth", statusCode: status, message: msg };
  }
  if (status >= 500) {
    let tail = "";
    if (typeof body === "object" && body !== null) {
      const b = body as {
        message?: unknown;
        detail?: unknown;
        error?: unknown;
      };
      const msg =
        typeof b.message === "string"
          ? b.message
          : typeof b.detail === "string"
            ? b.detail
            : typeof b.error === "string"
              ? b.error
              : "";
      if (msg) tail = `: ${msg}`;
    }
    return { kind: "retriable", reason: `HTTP ${status}${tail}` };
  }
  return { kind: "terminal", statusCode: status, body };
}

// ---------------------------------------------------------------------------
// HTTP primitives
// ---------------------------------------------------------------------------
async function openOnce(
  itemType: PhysicalCountItemType,
  itemId: string,
  session: Session,
  signal: AbortSignal,
): Promise<AttemptDisposition<PhysicalCountOpenResponse>> {
  let res: Response;
  try {
    const url = new URL(
      "/api/physical-count/open",
      typeof window !== "undefined" ? window.location.origin : "http://local",
    );
    url.searchParams.set("item_type", itemType);
    url.searchParams.set("item_id", itemId);
    void session; // reserved for future audit logging; real identity via proxy
    res = await fetch(url.pathname + url.search, {
      method: "GET",
      signal,
    });
  } catch (err) {
    return {
      kind: "retriable",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  let body: unknown = undefined;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  return classify<PhysicalCountOpenResponse>(
    res,
    body,
    (b, status): b is PhysicalCountOpenResponse =>
      status === 200 &&
      typeof b === "object" &&
      b !== null &&
      "snapshot_id" in b,
  );
}

async function submitOnce(
  envelope: PhysicalCountSubmit,
  session: Session,
  signal: AbortSignal,
): Promise<
  | AttemptDisposition<PhysicalCountCommittedResponse>
  | { kind: "pending"; body: PhysicalCountPendingResponse }
> {
  let res: Response;
  try {
    void session; // reserved for future audit logging; real identity via proxy
    res = await fetch("/api/physical-count", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(envelope),
      signal,
    });
  } catch (err) {
    return {
      kind: "retriable",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const status = res.status;
  let body: unknown = undefined;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }

  // 202 pending is a distinct success shape — split it out before classify().
  if (
    status === 202 &&
    typeof body === "object" &&
    body !== null &&
    (body as { status?: unknown }).status === "pending"
  ) {
    return { kind: "pending", body: body as PhysicalCountPendingResponse };
  }

  return classify<PhysicalCountCommittedResponse>(
    res,
    body,
    (b): b is PhysicalCountCommittedResponse =>
      typeof b === "object" &&
      b !== null &&
      (b as { status?: unknown }).status === "posted",
  );
}

async function cancelOnce(
  snapshotId: string,
  session: Session,
): Promise<CancelResult> {
  try {
    void session; // reserved for future audit logging; real identity via proxy
    const res = await fetch(
      `/api/physical-count/${encodeURIComponent(snapshotId)}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idempotency_key: newIdempotencyKey() }),
      },
    );
    const body = await res.json().catch(() => undefined);
    if (
      res.status === 200 &&
      body &&
      typeof body === "object" &&
      "released" in body
    ) {
      return {
        kind: "cancelled",
        body: body as PhysicalCountCancelSuccessResponse,
      };
    }
    if (
      res.status === 409 &&
      body &&
      typeof body === "object" &&
      "reason_code" in body
    ) {
      return { kind: "conflict", body: body as PhysicalCountConflictResponse };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        kind: "auth",
        statusCode: res.status,
        message:
          body && typeof body === "object" && "error" in body
            ? String((body as { error: unknown }).error)
            : undefined,
      };
    }
    return { kind: "network", message: "Could not submit. Check your connection and try again." };
  } catch (err) {
    return {
      kind: "network",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Retry policy (mirrors waste + goods-receipt)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Public hook
// ---------------------------------------------------------------------------
export interface UsePhysicalCountFlow {
  open: (
    itemType: PhysicalCountItemType,
    itemId: string,
    session: Session,
  ) => Promise<OpenResult>;
  submit: (
    form: PhysicalCountFormValues,
    snapshotId: string,
    session: Session,
  ) => Promise<SubmitResult>;
  cancel: (snapshotId: string, session: Session) => Promise<CancelResult>;
  status: SubmitStatus;
  lastResult: SubmitResult | null;
  reset: () => void;
}

export function usePhysicalCountFlow(): UsePhysicalCountFlow {
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [lastResult, setLastResult] = useState<SubmitResult | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const open = useCallback(
    async (
      itemType: PhysicalCountItemType,
      itemId: string,
      session: Session,
    ): Promise<OpenResult> => {
      const controller = new AbortController();
      let attempts = 0;
      let lastError = "";
      for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
        attempts = i + 1;
        const disp = await openOnce(itemType, itemId, session, controller.signal);
        if (disp.kind === "ok")
          return { kind: "opened", body: disp.body };
        if (
          disp.kind === "conflict" ||
          disp.kind === "validation" ||
          disp.kind === "auth"
        )
          return disp;
        if (disp.kind === "terminal")
          return {
            kind: "network",
            attempts,
            lastError: `HTTP ${disp.statusCode}`,
          };
        // retriable
        lastError = disp.reason;
        if (i < RETRY_DELAYS_MS.length) {
          await sleepWithAbort(RETRY_DELAYS_MS[i], controller.signal);
        }
      }
      return { kind: "network", attempts, lastError };
    },
    [],
  );

  const submit = useCallback(
    async (
      form: PhysicalCountFormValues,
      snapshotId: string,
      session: Session,
    ): Promise<SubmitResult> => {
      if (!idempotencyKeyRef.current)
        idempotencyKeyRef.current = newIdempotencyKey();
      const envelope = buildSubmitEnvelope(
        form,
        snapshotId,
        idempotencyKeyRef.current,
      );

      const controller = new AbortController();
      setStatus("submitting");

      let attempts = 0;
      let lastError = "";
      for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
        attempts = i + 1;
        const disp = await submitOnce(envelope, session, controller.signal);

        if (disp.kind === "ok") {
          const result: SubmitResult = { kind: "committed", body: disp.body };
          setLastResult(result);
          setStatus("done");
          idempotencyKeyRef.current = null;
          return result;
        }
        if (disp.kind === "pending") {
          const result: SubmitResult = { kind: "pending", body: disp.body };
          setLastResult(result);
          setStatus("done");
          idempotencyKeyRef.current = null;
          return result;
        }
        if (
          disp.kind === "conflict" ||
          disp.kind === "validation" ||
          disp.kind === "auth"
        ) {
          const result: SubmitResult = disp;
          setLastResult(result);
          setStatus("done");
          idempotencyKeyRef.current = null;
          return result;
        }
        if (disp.kind === "terminal") {
          const result: SubmitResult = {
            kind: "network",
            attempts,
            lastError: `HTTP ${disp.statusCode}`,
          };
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

  const cancel = useCallback(
    (snapshotId: string, session: Session) =>
      cancelOnce(snapshotId, session),
    [],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setLastResult(null);
    idempotencyKeyRef.current = null;
  }, []);

  return { open, submit, cancel, status, lastResult, reset };
}
