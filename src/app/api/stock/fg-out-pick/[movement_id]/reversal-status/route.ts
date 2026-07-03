import { proxyRequest } from "@/lib/api-proxy";

// GET /api/stock/fg-out-pick/[movement_id]/reversal-status — proxy to Fastify
//   GET /api/v1/queries/stock/fg-out-pick/:movement_id/reversal-status
// Any authenticated role may read this (the Movement Log details drawer
// checks it before rendering the Undo affordance).

export async function GET(
  req: Request,
  { params }: { params: Promise<{ movement_id: string }> },
): Promise<Response> {
  const { movement_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/stock/fg-out-pick/${encodeURIComponent(movement_id)}/reversal-status`,
    errorLabel: "delivery reversal status",
  });
}
