import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/boms/versions — proxy to Fastify
//   POST /api/v1/mutations/boms/versions
//
// AMMC v1 Slice 2: admin-only create of a new bom_version row. Body carries
// { head_id, clone_from_version_id?, idempotency_key }. Returned version is
// status='draft'. Line mutations + publish live in Slice 6.
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/boms/versions",
    errorLabel: "bom version create",
  });
}
