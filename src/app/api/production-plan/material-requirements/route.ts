import { proxyRequest } from "@/lib/api-proxy";

// GET /api/production-plan/material-requirements?from=&to=
//   → /api/v1/queries/production-plan/material-requirements
//
// Date-range purchasing aggregator: explodes every planned production job in
// the range, nets aggregated component demand against on-hand stock, and
// groups the result by component / supplier. Feeds the "Date range plan" mode
// of /planning/production-simulation.
//
// Backend: gt-factory-os/api/src/production-plan/material_requirements.ts.

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/production-plan/material-requirements",
    errorLabel: "production plan material requirements",
  });
}
