import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/components/[component_id]/readiness — proxy to Fastify
//   GET /api/v1/queries/components/:component_id/readiness
//
// AMMC v1 Slice 5 UI: single-component full readiness payload. Returns the
// { is_ready, readiness_summary?, blockers[] } shape <ReadinessCard> and
// <ReadinessPill> consume. Read-only; any authenticated role allowed upstream
// (same posture as the LIST endpoint). 404 on unknown component_id; 200 on
// match. W1 backend landed at canonical 0d406c8 (Railway redeploy
// 15ae0eae-8ff1-45d8-a044-170266f1cfc3). View backing:
// api_read.v_component_readiness (migration 0069, plan §E.2).
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ component_id: string }> },
): Promise<Response> {
  const { component_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/components/${encodeURIComponent(component_id)}/readiness`,
    errorLabel: "component readiness",
  });
}
