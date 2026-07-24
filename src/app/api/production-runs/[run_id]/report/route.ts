import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/production-runs/[run_id]/report — proxy to Fastify API
//   POST /api/v1/mutations/production-runs/:run_id/report
//
// The end-of-run report: after production, the operator posts output + scrap +
// optional QC (Brix/pH/sample/note) + notes. The backend writes OUTPUT ledger
// rows only (consumption already happened at pick-confirm time) and moves the
// run to REPORTED. 409 RUN_NOT_REPORTABLE / RUN_ALREADY_REPORTED /
// STALE_BOM_VERSION and 503 break-glass are surfaced to the operator by the
// page. Bearer JWT forwarded by proxyRequest.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ run_id: string }> },
): Promise<Response> {
  const { run_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/production-runs/${encodeURIComponent(run_id)}/report`,
    errorLabel: "production-run report",
  });
}
