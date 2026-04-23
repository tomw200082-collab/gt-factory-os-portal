import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/boms/heads/[head_id]/simulate
//
// GET → Fastify GET /api/v1/queries/boms/heads/:head_id/simulate?qty=<number>
//
// Returns exploded component requirements for the requested production quantity
// using the active BOM version. Pure read — no side effects.
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ head_id: string }> },
): Promise<Response> {
  const { head_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/boms/heads/${encodeURIComponent(head_id)}/simulate`,
    forwardQuery: true,
    errorLabel: "bom simulate",
  });
}
