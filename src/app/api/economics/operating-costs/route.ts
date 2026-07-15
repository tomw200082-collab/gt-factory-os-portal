import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// PATCH /api/economics/operating-costs — proxy to Fastify
//   PATCH /api/v1/mutations/economics/operating-costs
//
// Tranche 128. Upserts operating_cost_model lines (labor / overhead / channel
// fees / shipping …) in one all-or-nothing transaction with an audit log row
// per line. planner + admin only, enforced server-side.
// ---------------------------------------------------------------------------

export async function PATCH(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: "/api/v1/mutations/economics/operating-costs",
    errorLabel: "operating costs update",
  });
}
