import { proxyRequest } from "@/lib/api-proxy";

// POST /api/stock/fg-out-pick/[movement_id]/undo — proxy to Fastify
//   POST /api/v1/mutations/stock/fg-out-pick/:movement_id/undo
// Backend enforces admin/planner-only; body { reason?: string }.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ movement_id: string }> },
): Promise<Response> {
  const { movement_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/stock/fg-out-pick/${encodeURIComponent(movement_id)}/undo`,
    forwardBody: true,
    errorLabel: "undo delivery",
  });
}
