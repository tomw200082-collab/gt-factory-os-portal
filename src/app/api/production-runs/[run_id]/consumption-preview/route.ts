import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/production-runs/[run_id]/consumption-preview?output_qty= — proxy to
//   GET /api/v1/queries/production-runs/:run_id/consumption-preview
//
// What this report is about to take out of stock, for a candidate output
// quantity. Read-only: no ledger row, no pin, no status flip, so it is safe to
// call while the operator is still typing. Backs the summary step that stands
// between entering the quantity and posting it.
//
// The upstream runs the same reconciliation the report itself runs, so what is
// shown here is what actually posts.
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ run_id: string }> },
): Promise<Response> {
  const { run_id } = await params;
  const outputQty = new URL(req.url).searchParams.get("output_qty") ?? "";
  return proxyRequest(req, {
    method: "GET",
    upstreamPath:
      `/api/v1/queries/production-runs/${encodeURIComponent(run_id)}` +
      `/consumption-preview?output_qty=${encodeURIComponent(outputQty)}`,
    errorLabel: "production run consumption preview",
  });
}
