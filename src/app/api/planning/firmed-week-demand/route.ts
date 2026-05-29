import { proxyRequest } from "@/lib/api-proxy";

// GET /api/planning/firmed-week-demand?week_start=YYYY-MM-DD
//   → /api/v1/queries/planning/firmed-week-demand
//
// Weekly cadence (Brick A) — the firm→procurement seam, API face. Per-FG unit
// demand for the firmed week (view 0221). Lets the cockpit show "what this
// committed week will produce" and gives procurement a queryable signal.
// All four roles may read.
//
// Backend: gt-factory-os/api/src/planning/handler.firmed_week_demand.ts + route.ts.

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/planning/firmed-week-demand",
    errorLabel: "planning firmed week demand",
  });
}
