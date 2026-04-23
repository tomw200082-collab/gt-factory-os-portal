import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// /api/boms/heads/[head_id]/net-requirements
//
// GET → Fastify GET /api/v1/queries/boms/heads/:head_id/net-requirements?qty=<n>
//
// Returns gross component requirements minus current on-hand stock,
// showing net shortage and coverage status per component.
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ head_id: string }> },
): Promise<Response> {
  const { head_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/boms/heads/${encodeURIComponent(head_id)}/net-requirements`,
    forwardQuery: true,
    errorLabel: "bom net requirements",
  });
}
