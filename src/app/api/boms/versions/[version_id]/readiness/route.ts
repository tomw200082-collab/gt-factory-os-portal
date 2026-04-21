import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/boms/versions/[version_id]/readiness — proxy to Fastify
//   GET /api/v1/queries/boms/versions/:version_id/readiness
//
// AMMC v1 Slice 5 UI: single bom_version full readiness payload. Returns
// the { is_ready, readiness_summary?, blockers[] } shape. Read-only; any
// authenticated role allowed upstream. 422 on malformed uuid; 404 on unknown
// version_id; 200 on match. W1 backend landed at canonical 0d406c8 (Railway
// redeploy 15ae0eae-8ff1-45d8-a044-170266f1cfc3). View backing:
// api_read.v_bom_version_readiness (migration 0069, plan §E.3). Includes
// publish-safety preflight report per plan §D.3.
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ version_id: string }> },
): Promise<Response> {
  const { version_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/boms/versions/${encodeURIComponent(version_id)}/readiness`,
    errorLabel: "bom version readiness",
  });
}
