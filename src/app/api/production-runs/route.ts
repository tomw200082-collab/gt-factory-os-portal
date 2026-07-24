import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/production-runs — proxy to Fastify API
//   POST /api/v1/mutations/production-runs
//
// Creates an unplanned run: body { item_id, target_qty, uom, stage?, notes? }.
// The upstream tags it unplanned:true and flags it immediately (never blocks).
// Supabase Bearer JWT forwarded by proxyRequest.
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/production-runs",
    errorLabel: "unplanned production run",
  });
}
