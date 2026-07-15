import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/unit-economics — proxy to Fastify
//   GET /api/v1/queries/unit-economics?target_pct=25
//
// Tranche 128. The Decision Board's single read surface: CM2 waterfall rows
// from private_core.v_fg_unit_economics (migration 0283) + server-computed
// target price, decision classification, totals and the operating-cost model
// rows. The querystring (target_pct) forwards upstream by default.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/unit-economics",
    errorLabel: "unit economics list",
  });
}
