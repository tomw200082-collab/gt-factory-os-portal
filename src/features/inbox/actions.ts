// ---------------------------------------------------------------------------
// Unified Inbox feature — exception actions (Tranche B §D).
//
// Exception state transitions are owned by the upstream API. The portal
// inbox forwards the caller-provided idempotency key verbatim; no key
// minting here (per the api client contract in src/lib/api/client.ts).
// ---------------------------------------------------------------------------

import { post } from "@/lib/api/client";
import type { Result } from "@/lib/api/client";

export interface AcknowledgeExceptionResult {
  exception_id: string;
  status: "acknowledged";
  acknowledged_by: string;
  acknowledged_at: string;
  idempotent_replay: boolean;
}

export interface ResolveExceptionResult {
  exception_id: string;
  status: "resolved";
  resolved_by: string;
  resolved_at: string;
  resolution_notes: string;
  idempotent_replay: boolean;
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `inbox_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Acknowledge a non-approval exception row.
 *
 * Backing endpoint: POST /api/v1/mutations/exceptions/:id/acknowledge
 * Portal proxy: /api/exceptions/:id/acknowledge (route.ts).
 */
export function acknowledgeException(
  exceptionId: string,
  idempotencyKey: string,
): Promise<Result<AcknowledgeExceptionResult>> {
  const url = `/api/exceptions/${encodeURIComponent(exceptionId)}/acknowledge`;
  return post<AcknowledgeExceptionResult>(url, {
    idempotency_key: idempotencyKey,
  });
}

/**
 * Resolve a non-approval exception row.
 *
 * resolutionNotes is OPTIONAL per Tom 2026-05-02 — operators frequently
 * bulk-resolve cosmetic exceptions where a justification adds friction
 * without analytical value. When omitted (or empty/whitespace), the upstream
 * stores NULL.
 *
 * Backing endpoint: POST /api/v1/mutations/exceptions/:id/resolve
 * Portal proxy: /api/exceptions/:id/resolve (route.ts).
 */
export function resolveException(
  exceptionId: string,
  resolutionNotes: string | undefined,
  idempotencyKey: string,
): Promise<Result<ResolveExceptionResult>> {
  const url = `/api/exceptions/${encodeURIComponent(exceptionId)}/resolve`;
  const trimmed = resolutionNotes?.trim();
  const body: { idempotency_key: string; resolution_notes?: string } = {
    idempotency_key: idempotencyKey,
  };
  if (trimmed && trimmed.length > 0) body.resolution_notes = trimmed;
  return post<ResolveExceptionResult>(url, body);
}

// ---------------------------------------------------------------------------
// Bulk resolve (Tom 2026-05-02). Per-id outcome surfaced so the UI can
// summarize "X resolved, Y already-resolved, Z conflict" without needing to
// re-fetch.
// ---------------------------------------------------------------------------

export interface BulkResolveItemResult {
  exception_id: string;
  outcome: "resolved" | "idempotent_replay" | "conflict" | "not_found";
  status?: string;
  reason_code?: string;
  detail?: string;
  current_status?: string;
}

export interface BulkResolveResult {
  total: number;
  resolved: number;
  idempotent_replay: number;
  conflict: number;
  not_found: number;
  results: BulkResolveItemResult[];
}

export function bulkResolveExceptions(
  exceptionIds: string[],
  resolutionNotes: string | undefined,
  idempotencyKey: string,
): Promise<Result<BulkResolveResult>> {
  const trimmed = resolutionNotes?.trim();
  const body: {
    idempotency_key: string;
    exception_ids: string[];
    resolution_notes?: string;
  } = {
    idempotency_key: idempotencyKey,
    exception_ids: exceptionIds,
  };
  if (trimmed && trimmed.length > 0) body.resolution_notes = trimmed;
  return post<BulkResolveResult>("/api/exceptions/bulk-resolve", body);
}
