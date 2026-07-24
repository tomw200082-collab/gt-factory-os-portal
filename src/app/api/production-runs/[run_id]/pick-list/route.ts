import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/production-runs/[run_id]/pick-list — proxy to Fastify API
//   GET /api/v1/queries/production-runs/:run_id/pick-list
//
// BOM-exploded pick list for one run: liquids (RM) + packaging (PKG) lines,
// each with the required BOM quantity and current on-hand, plus the pinned
// pack/base BOM version ids the client must carry back on confirm (staleness
// protection). Supabase Bearer JWT forwarded by proxyRequest.
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ run_id: string }> },
): Promise<Response> {
  const { run_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/production-runs/${encodeURIComponent(run_id)}/pick-list`,
    errorLabel: "production run pick-list",
  });
}
