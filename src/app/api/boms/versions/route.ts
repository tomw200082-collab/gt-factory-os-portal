import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/boms/versions — dual-method proxy.
//
// GET   → Fastify GET  /api/v1/queries/boms/versions   (list; forwards
//         ?bom_head_id + ?status filters)
// POST  → Fastify POST /api/v1/mutations/boms/versions (AMMC v1 Slice 2:
//         admin-only create; body carries { head_id, clone_from_version_id?,
//         idempotency_key }; returned version is status='draft'). Line
//         mutations + publish live in Slice 6.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/boms/versions",
    errorLabel: "bom versions list",
  });
}

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/boms/versions",
    errorLabel: "bom version create",
  });
}
