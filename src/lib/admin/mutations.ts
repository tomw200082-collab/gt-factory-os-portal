// ---------------------------------------------------------------------------
// Admin mutation client helpers — AMMC v1 Slice 4.
//
// Shared small utilities for the 5 admin list pages that all follow the same
// pattern: PATCH a scalar field (InlineEditCell) or POST a status toggle
// against the per-entity proxy route, handling the canonical set of
// conflict codes (STALE_ROW, STATUS_ALREADY, REFERENTIAL_BLOCK, etc.).
// ---------------------------------------------------------------------------

function randomIdempotencyKey(): string {
  // RFC 4122 v4-ish random UUID using crypto.randomUUID where available
  // (evergreen browsers + Node ≥ 14.17). Fallback to a random-hex string.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Thrown when a proxy call returns a non-2xx. `code` is the server-returned
 * machine-readable conflict code (e.g. "STALE_ROW") when present; `status`
 * is the HTTP status; `message` is the human-readable text surfaced to the UI.
 */
export class AdminMutationError extends Error {
  public readonly status: number;
  public readonly code: string | undefined;
  public readonly body: unknown;
  constructor(
    status: number,
    message: string,
    code?: string,
    body?: unknown,
  ) {
    super(message);
    this.name = "AdminMutationError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/**
 * PATCH helper. Adds { if_match_updated_at, idempotency_key } to the body and
 * parses the response. Throws {@link AdminMutationError} on non-2xx.
 */
export async function patchEntity<TResponse = unknown>(params: {
  url: string;
  fields: Record<string, unknown>;
  ifMatchUpdatedAt: string;
  idempotencyKey?: string;
}): Promise<TResponse> {
  const res = await fetch(params.url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      ...params.fields,
      if_match_updated_at: params.ifMatchUpdatedAt,
      idempotency_key: params.idempotencyKey ?? randomIdempotencyKey(),
    }),
  });
  return await parseOrThrow<TResponse>(res, "update");
}

/**
 * POST status toggle helper. Body = { status, if_match_updated_at,
 * idempotency_key }.
 */
export async function postStatus<TResponse = unknown>(params: {
  url: string;
  status: "ACTIVE" | "INACTIVE" | "PENDING" | string;
  ifMatchUpdatedAt: string;
  idempotencyKey?: string;
}): Promise<TResponse> {
  const res = await fetch(params.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      status: params.status,
      if_match_updated_at: params.ifMatchUpdatedAt,
      idempotency_key: params.idempotencyKey ?? randomIdempotencyKey(),
    }),
  });
  return await parseOrThrow<TResponse>(res, "status");
}

async function parseOrThrow<TResponse>(
  res: Response,
  kind: string,
): Promise<TResponse> {
  const body = await res.json().catch(() => null);
  if (res.ok) return body as TResponse;

  const code =
    body && typeof body === "object" && "code" in body
      ? String((body as { code?: unknown }).code ?? "")
      : undefined;
  const message =
    body && typeof body === "object" && "message" in body
      ? String((body as { message?: unknown }).message ?? `HTTP ${res.status}`)
      : `${kind} failed (HTTP ${res.status})`;
  throw new AdminMutationError(res.status, message, code || undefined, body);
}

/**
 * Tone mapping for readiness pill rendering. Matches <ReadinessCard> conventions
 * at a smaller footprint.
 */
export function readinessToneFromPayload(payload: {
  is_ready?: boolean;
  blockers?: unknown[];
} | null | undefined): "green" | "yellow" | "red" | "unknown" {
  if (!payload) return "unknown";
  const blockerCount = Array.isArray(payload.blockers) ? payload.blockers.length : 0;
  if (payload.is_ready === false) return "red";
  if (payload.is_ready === true && blockerCount > 0) return "yellow";
  if (payload.is_ready === true) return "green";
  return "unknown";
}
