import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/economics/recalculate — proxy to Fastify
//   POST /api/v1/mutations/economics/recalculate
//
// Phase 10A: admin-only manual trigger of the COGS snapshot job. The nightly
// job runs at 04:00 UTC; this endpoint lets admins re-snapshot on demand
// after editing component costs.
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/economics/recalculate",
    errorLabel: "economics recalculate",
  });
}
