import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/supplier-items — dual-method proxy.
//
// GET   → Fastify GET  /api/v1/queries/supplier-items   (requires one-of
//         ?supplier_id | ?component_id | ?item_id filter)
// POST  → Fastify POST /api/v1/mutations/supplier-items (AMMC v1 Slice 2:
//         admin-only create; body carries polymorphic component_id XOR
//         item_id; 422 on violation)
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/supplier-items",
    errorLabel: "supplier-items list",
  });
}

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/supplier-items",
    errorLabel: "supplier-items create",
  });
}
