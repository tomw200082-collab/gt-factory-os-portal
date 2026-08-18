import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/leads/:lead_id/events
//   → GET /api/v1/queries/sales/leads/:lead_id/events

export async function GET(
  req: Request,
  { params }: { params: Promise<{ lead_id: string }> },
): Promise<Response> {
  const { lead_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/sales/leads/${encodeURIComponent(lead_id)}/events`,
    forwardQuery: false,
    errorLabel: "sales lead events",
  });
}
