import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/groups/assign — mutation proxy (Tranche 044, Groups v1).
//
// POST → Fastify POST /api/v1/mutations/groups/assign
//        (admin-only bulk FK assignment; body carries idempotency_key +
//        { kind:'product', key, item_ids[] } or
//        { kind:'material', key, component_ids[] }).
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/groups/assign",
    errorLabel: "group assign",
  });
}
