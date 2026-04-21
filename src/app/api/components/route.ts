import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/components — dual-method proxy.
//
// GET   → Fastify GET  /api/v1/queries/components   (forwards filters)
// POST  → Fastify POST /api/v1/mutations/components (AMMC v1 Slice 2: admin-
//         only create; body passes through untouched)
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/components",
    errorLabel: "components list",
  });
}

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/components",
    errorLabel: "components create",
  });
}
