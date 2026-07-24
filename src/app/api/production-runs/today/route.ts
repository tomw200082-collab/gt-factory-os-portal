import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/production-runs/today?date=YYYY-MM-DD — proxy to Fastify API
//   GET /api/v1/queries/production-runs/today
//
// Today's runs from the plan, ordered "make tank → fill A → fill B". The
// ?date= querystring passes through (forwardQuery defaults true for GET).
// Supabase Bearer JWT forwarded by proxyRequest; auth enforced upstream.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/production-runs/today",
    errorLabel: "production runs today",
  });
}
