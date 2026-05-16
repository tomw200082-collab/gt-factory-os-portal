import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/economics/price-history/[component_id] — proxy to Fastify
//   GET /api/v1/queries/economics/price-history/:component_id
//
// Returns the raw-material price-change history for one component, covering
// both the primary supplier_items row and component fallback-cost edits.
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ component_id: string }> },
): Promise<Response> {
  const { component_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/economics/price-history/${encodeURIComponent(component_id)}`,
    errorLabel: "economics price history",
  });
}
