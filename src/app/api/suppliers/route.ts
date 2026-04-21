import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/suppliers — dual-method proxy.
//
// GET   → Fastify GET  /api/v1/queries/suppliers   (forwards filters)
// POST  → Fastify POST /api/v1/mutations/suppliers (AMMC v1 Slice 2: admin-
//         only create)
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/suppliers",
    errorLabel: "suppliers list",
  });
}

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/suppliers",
    errorLabel: "suppliers create",
  });
}
