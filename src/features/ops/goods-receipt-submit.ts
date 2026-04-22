"use client";

// ---------------------------------------------------------------------------
// Goods Receipt submit pipeline.
//
// Responsibilities:
//   1. Build the wire envelope from form values (form → API adapter).
//   2. Generate one idempotency_key per logical submission; reuse on retry.
//   3. POST to the portal proxy at /api/goods-receipts (never direct to API).
//   4. Retry on network / 5xx with bounded exponential backoff.
//   5. Return a discriminated result the UI renders: committed / conflict /
//      validation / auth / network.
//
// In-memory outbox: submission state lives in the hook's React state and a
// per-hook idempotency-key ref. On page unload or navigation the envelope is
// lost (acceptable per current scope).
// ---------------------------------------------------------------------------

import { useCallback, useRef, useState } from "react";
import type {
  ConflictResponse,
  GoodsReceiptCommittedResponse,
  GoodsReceiptRequest,
  ItemType,
  ValidationResponse,
} from "@/lib/contracts/goods-receipts";
import type { Session } from "@/lib/auth/fake-auth";
import type { GoodsReceiptFormValues } from "./goods-receipt-schema";

export type SubmitResult =
  | { kind: "committed"; body: GoodsReceiptCommittedResponse }
  | { kind: "conflict"; body: ConflictResponse }
  | { kind: "validation"; body: ValidationResponse }
  | { kind: "auth"; statusCode: 401 | 403; message?: string }
  | { kind: "network"; attempts: number; lastError: string };

export type SubmitStatus = "idle" | "submitting" | "retrying" | "done";

export type ItemTypeResolver = (item_id: string) => ItemType | null;

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `gr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// datetime-local (YYYY-MM-DDTHH:mm) → ISO datetime. Existing ISO input passes through.
function toIsoDateTime(value: string): string {
  return new Date(value).toISOString();
}

export function buildEnvelope(
  form: GoodsReceiptFormValues,
  idempotencyKey: string,
  resolveItemType: ItemTypeResolver,
): GoodsReceiptRequest {
  return {
    idempotency_key: idempotencyKey,
    event_at: toIsoDateTime(form.event_at),
    supplier_id: form.supplier_id,
    po_id: form.po_id && form.po_id !== "" ? form.po_id : null,
    notes: form.notes && form.notes !== "" ? form.notes : null,
    lines: form.lines.map((line) => {
      const resolved = resolveItemType(line.item_id);
      // Fallback is RM; API will return 409 ITEM_TYPE_MISMATCH if incorrect.
      const item_type: ItemType = resolved ?? "RM";
      return {
        item_type,
        item_id: line.item_id,
        quantity: line.quantity,
        unit: line.unit,
        po_line_id: null,
        notes: line.notes && line.notes !== "" ? line.notes : null,
      };
    }),
  };
}

type AttemptDisposition =
  | { kind: "committed"; body: GoodsReceiptCommittedResponse }
  | { kind: "conflict"; body: ConflictResponse }
  | { kind: "validation"; body: ValidationResponse }
  | { kind: "auth"; statusCode: 401 | 403; message?: string }
  | { kind: "retriable"; reason: string }
  | { kind: "terminal"; statusCode: number; body: unknown };

async function postOnce(
  envelope: GoodsReceiptRequest,
  _session: Session,
  signal: AbortSignal,
): Promise<AttemptDisposition> {
  let res: Response;
  try {
    res = await fetch("/api/goods-receipts", {
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
    // non-JSON body
  }

  // Discriminate on body shape first — 201 fresh and 409 idempotent replay
  // both carry status:'posted' and must both render as success.
  if (
    typeof body === "object" &&
    body !== null &&
    (body as { status?: unknown }).status === "posted"
  ) {
    return { kind: "committed", body: body as GoodsReceiptCommittedResponse };
  }
  if (
    status === 409 &&
    typeof body === "object" &&
    body !== null &&
    "reason_code" in body
  ) {
    return { kind: "conflict", body: body as ConflictResponse };
  }
  if (
    status === 422 &&
    typeof body === "object" &&
    body !== null &&
    "validation_errors" in body
  ) {
    return { kind: "validation", body: body as ValidationResponse };
  }
  if (status === 401 || status === 403) {
    const msg =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : undefined;
    return { kind: "auth", statusCode: status, message: msg };
  }
  if (status >= 500) {
    return { kind: "retriable", reason: `HTTP ${status}` };
  }
  return { kind: "terminal", statusCode: status, body };
}

// Up to 3 retries after the initial attempt (4 total). On retriable failures
// only — 4xx classifications (auth, validation, conflict, terminal) never retry.
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

export interface UseGoodsReceiptSubmit {
  submit: (
    form: GoodsReceiptFormValues,
    session: Session,
    resolveItemType: ItemTypeResolver,
  ) => Promise<void>;
  reset: () => void;
  status: SubmitStatus;
  attempts: number;
  result: SubmitResult | null;
  idempotencyKey: string | null;
}

export function useGoodsReceiptSubmit(): UseGoodsReceiptSubmit {
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [attempts, setAttempts] = useState(0);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const keyRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const submit = useCallback<UseGoodsReceiptSubmit["submit"]>(
    async (form, session, resolveItemType) => {
      if (keyRef.current === null) {
        keyRef.current = newIdempotencyKey();
      }
      const envelope = buildEnvelope(form, keyRef.current, resolveItemType);

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setResult(null);
      setStatus("submitting");
      setAttempts(0);

      let attempt = 0;
      let lastRetriable = "";

      while (!ac.signal.aborted) {
        attempt += 1;
        setAttempts(attempt);
        if (attempt > 1) setStatus("retrying");

        const disp = await postOnce(envelope, session, ac.signal);

        if (ac.signal.aborted) return;

        switch (disp.kind) {
          case "committed":
            setResult({ kind: "committed", body: disp.body });
            setStatus("done");
            return;
          case "conflict":
            setResult({ kind: "conflict", body: disp.body });
            setStatus("done");
            return;
          case "validation":
            setResult({ kind: "validation", body: disp.body });
            setStatus("done");
            return;
          case "auth":
            setResult({
              kind: "auth",
              statusCode: disp.statusCode,
              message: disp.message,
            });
            setStatus("done");
            return;
          case "terminal":
            setResult({
              kind: "network",
              attempts: attempt,
              lastError: `HTTP ${disp.statusCode}`,
            });
            setStatus("done");
            return;
          case "retriable":
            lastRetriable = disp.reason;
            if (attempt > RETRY_DELAYS_MS.length) {
              setResult({
                kind: "network",
                attempts: attempt,
                lastError: lastRetriable,
              });
              setStatus("done");
              return;
            }
            await sleepWithAbort(RETRY_DELAYS_MS[attempt - 1], ac.signal);
            continue;
        }
      }
    },
    [],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    keyRef.current = null;
    setStatus("idle");
    setAttempts(0);
    setResult(null);
  }, []);

  return {
    submit,
    reset,
    status,
    attempts,
    result,
    idempotencyKey: keyRef.current,
  };
}
