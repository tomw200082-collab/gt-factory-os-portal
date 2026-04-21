import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/planning-policy — proxy to Fastify
//   GET /api/v1/queries/planning-policy
//
// AMMC v1 Slice 4: list all planning_policy KV rows for the un-quarantined
// /admin/planning-policy page. Read path; admin role-gate enforced upstream.
// PATCH lives at /api/planning-policy/[key]/route.ts.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/planning-policy",
    errorLabel: "planning-policy list",
  });
}
