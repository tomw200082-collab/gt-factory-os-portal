// ---------------------------------------------------------------------------
// Quick-Create shared helpers — AMMC v1 Slice 3.
//
// Collected here so every Quick-Create drawer follows the same pattern:
//   - fetch with Content-Type: application/json
//   - 404 → graceful "Slice 4 pending" banner signal (structured discriminated
//     union; caller renders accordingly)
//   - 409 / 422 / 5xx → surface server error message to the banner
//   - 201 / 200 → extract the created id using a caller-supplied field name
// ---------------------------------------------------------------------------

export type QuickCreateResult<TId extends string | number = string> =
  | { kind: "ok"; id: TId; payload: unknown }
  | { kind: "endpoint_pending"; status: 404 }
  | { kind: "conflict"; status: number; message: string; code?: string }
  | { kind: "validation"; status: 422; message: string; issues: unknown }
  | { kind: "error"; status: number; message: string };

export interface QuickCreatePostOptions {
  /** Absolute or relative URL of the proxy route (e.g. "/api/items"). */
  url: string;
  /** JSON body to POST. */
  body: unknown;
  /** Field on the success response whose value is the new entity id. */
  idField?: string;
}

export async function quickCreatePost<TId extends string | number = string>(
  opts: QuickCreatePostOptions,
): Promise<QuickCreateResult<TId>> {
  const idField = opts.idField ?? "id";
  let res: Response;
  try {
    res = await fetch(opts.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(opts.body),
    });
  } catch (err) {
    return {
      kind: "error",
      status: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (res.status === 404) {
    return { kind: "endpoint_pending", status: 404 };
  }

  const body = await res.json().catch(() => null);

  if (res.status >= 200 && res.status < 300) {
    const id =
      body && typeof body === "object" && idField in (body as Record<string, unknown>)
        ? ((body as Record<string, unknown>)[idField] as TId)
        : undefined;
    if (id === undefined) {
      return {
        kind: "error",
        status: res.status,
        message: `Server returned ${res.status} but response body had no "${idField}" field.`,
      };
    }
    return { kind: "ok", id, payload: body };
  }

  if (res.status === 409) {
    return {
      kind: "conflict",
      status: 409,
      message:
        (body as { message?: string } | null)?.message ??
        "Request conflicted with current server state.",
      code: (body as { code?: string } | null)?.code,
    };
  }

  if (res.status === 422) {
    return {
      kind: "validation",
      status: 422,
      message:
        (body as { message?: string } | null)?.message ?? "Validation failed.",
      issues: (body as { issues?: unknown } | null)?.issues ?? null,
    };
  }

  return {
    kind: "error",
    status: res.status,
    message:
      (body as { message?: string } | null)?.message ??
      "Could not save. Check your connection and try again.",
  };
}

/**
 * TanStack Query keys that the Slice 4 list pages will consume. Centralised
 * so quick-creates can invalidate them consistently.
 */
export const QK = {
  items: ["admin", "items"] as const,
  components: ["admin", "components"] as const,
  suppliers: ["admin", "suppliers"] as const,
  supplierItems: ["admin", "supplier-items"] as const,
};
