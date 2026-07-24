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
  // ?intent=report is forwarded so opening the report screen for a run nobody
  // collected for does not flip it to "Collecting" as a side effect of a read.
  const intent = new URL(req.url).searchParams.get("intent") === "report" ? "?intent=report" : "";
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/production-runs/${encodeURIComponent(run_id)}/pick-list${intent}`,
    errorLabel: "production run pick-list",
  });
}
