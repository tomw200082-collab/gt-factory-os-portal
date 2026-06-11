import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/production-actuals/[submission_id] — proxy to Fastify API
//   GET /api/v1/queries/production-actuals/:submission_id  (Tranche 050, B2)
//
// Returns the full committed production report (output/scrap/uom, item,
// event_at, reported_by, plan linkage, consumption rows with component names
// + movement ids, reversal status) — or, for a reversal envelope id, the
// mirrored *_REVERSAL rows plus reverses_submission_id. Any authenticated
// role may read. 404 SUBMISSION_NOT_FOUND when the id is unknown.
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ submission_id: string }> },
): Promise<Response> {
  const { submission_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/production-actuals/${encodeURIComponent(submission_id)}`,
    errorLabel: "production-actual detail",
  });
}
