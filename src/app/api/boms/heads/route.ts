import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/boms/heads — dual-method proxy.
//
// GET   → Fastify GET  /api/v1/queries/boms/heads   (list; forwards filters)
// POST  → Fastify POST /api/v1/mutations/boms/heads (AMMC v1 Slice 2:
//         admin-only create; body carries { item_id, idempotency_key }; one
//         head per item — 409 UNIQUE_VIOLATION on duplicate; item must not
//         be BOUGHT_FINISHED — 409 INVALID_SUPPLY_METHOD). BOM-version
//         create + line mutations live in Slice 6.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/boms/heads",
    errorLabel: "bom heads list",
  });
}

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/boms/heads",
    errorLabel: "bom head create",
  });
}
