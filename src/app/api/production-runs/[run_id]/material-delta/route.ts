import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// POST /api/production-runs/[run_id]/material-delta — proxy to Fastify API
//   POST /api/v1/mutations/production-runs/:run_id/material-delta
//
// Append-only correction on an active run: add more of a material (consume) or
// return some (return). Body { component_id, source, direction, qty, notes? }.
// Never rewrites the original pick — each delta is its own ledger movement.
// Bearer JWT forwarded by proxyRequest.
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ run_id: string }> },
): Promise<Response> {
  const { run_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/production-runs/${encodeURIComponent(run_id)}/material-delta`,
    errorLabel: "production run material-delta",
  });
}
