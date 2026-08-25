import { proxyRequest } from "@/lib/api-proxy";

// POST /api/sales/leads/:lead_id/convert
//   → POST /api/v1/mutations/sales/leads/:lead_id/convert
//
// Separate from /outcome because record_outcome cannot write 'won' by design:
// sales_core.convert_lead is its sole writer, and the only route that also
// emits the `converted` event api_read.v_sales_today's conversion branch needs.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ lead_id: string }> },
): Promise<Response> {
  const { lead_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/sales/leads/${encodeURIComponent(lead_id)}/convert`,
    forwardQuery: false,
    errorLabel: "sales lead convert",
  });
}
