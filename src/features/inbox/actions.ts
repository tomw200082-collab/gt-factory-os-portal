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
 * Resolve a non-approval exception row with required resolution notes
 * (1..2000 chars per upstream ResolveRequestSchema).
 *
 * Backing endpoint: POST /api/v1/mutations/exceptions/:id/resolve
 * Portal proxy: /api/exceptions/:id/resolve (route.ts).
 */
export function resolveException(
  exceptionId: string,
  resolutionNotes: string,
  idempotencyKey: string,
): Promise<Result<ResolveExceptionResult>> {
  const url = `/api/exceptions/${encodeURIComponent(exceptionId)}/resolve`;
  return post<ResolveExceptionResult>(url, {
    idempotency_key: idempotencyKey,
    resolution_notes: resolutionNotes,
  });
}
