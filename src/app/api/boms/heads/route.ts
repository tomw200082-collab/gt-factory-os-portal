import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/boms/heads — proxy to Fastify
//   POST /api/v1/mutations/boms/heads
//
// AMMC v1 Slice 2: admin-only create of a new bom_head row. Body carries
// { item_id, idempotency_key }. One head per item (409 UNIQUE_VIOLATION on
// duplicate). Item must not be BOUGHT_FINISHED (409 INVALID_SUPPLY_METHOD).
// BOM-version create + line mutations live in Slice 6.
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/boms/heads",
    errorLabel: "bom head create",
  });
}
