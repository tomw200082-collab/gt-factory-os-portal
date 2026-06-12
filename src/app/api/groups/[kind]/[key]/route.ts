import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/groups/[kind]/[key] — mutation proxy (Tranche 044, Groups v1).
//
// PATCH → Fastify PATCH /api/v1/mutations/groups/:kind/:key
//         (admin-only metadata update; optimistic concurrency travels in the
//         body as if_match_updated_at per the backend If-Match contract —
//         shared/concurrency.ts uses JSON-body If-Match semantics, not the
//         HTTP header. Body also carries idempotency_key + any of name_en /
//         name_he / display_order / color_token / active.)
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ kind: string; key: string }> },
): Promise<Response> {
  const { kind, key } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/groups/${encodeURIComponent(kind)}/${encodeURIComponent(key)}`,
    errorLabel: "group update",
  });
}
