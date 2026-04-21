import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// PATCH /api/planning-policy/[key] — proxy to Fastify
//   PATCH /api/v1/mutations/planning-policy/:key
//
// AMMC v1 Slice 2/4: admin-only update of a single planning_policy KV row
// (value + optional uom_hint). Body carries { value, if_match_updated_at,
// idempotency_key }. No CREATE in v1 per plan §D.2. 404 NOT_FOUND if the
// key doesn't already exist; 409 STALE_ROW on optimistic-concurrency miss.
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/planning-policy/${encodeURIComponent(key)}`,
    errorLabel: "planning-policy update",
  });
}
