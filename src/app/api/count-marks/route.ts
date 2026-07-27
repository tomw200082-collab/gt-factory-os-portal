import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/count-marks — proxy to Fastify (migration 0299, tranche 153)
//   GET  /api/v1/queries/stock/count-marks    — open manual RM/PKG count marks
//   POST /api/v1/mutations/stock/count-marks  — set/clear one component's mark
//
// Thursday counting policy (Tom 2026-07-27): FG is counted in full and needs no
// mark; RM/PKG is counted only where the owner marked it. GET is readable by any
// authenticated user — the operator loads it on the tablet to build the count
// list. The admin/planner role-gate on POST is enforced upstream.
//
// Marks self-clear once the component is actually counted, so there is nothing
// here to reset or sweep.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/stock/count-marks",
    errorLabel: "count marks list",
  });
}

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/stock/count-marks",
    errorLabel: "count mark update",
  });
}
