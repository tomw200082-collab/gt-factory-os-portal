import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/items — dual-method proxy.
//
// GET   → Fastify GET  /api/v1/queries/items   (forwards ?status / ?supply_method /
//         ?include_readiness / ?limit)
// POST  → Fastify POST /api/v1/mutations/items (AMMC v1 Slice 2: admin-only
//         create; body passes through untouched)
//
// Forwards the Supabase Bearer JWT via proxyRequest; auth + role-gate
// enforced upstream.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/items",
    errorLabel: "items list",
  });
}

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/items",
    errorLabel: "items create",
  });
}
