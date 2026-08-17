import { proxyRequest } from "@/lib/api-proxy";

// POST /api/sales/leads/:lead_id/next-touch
//   → POST /api/v1/mutations/sales/leads/:lead_id/next-touch

export async function POST(
  req: Request,
  { params }: { params: Promise<{ lead_id: string }> },
): Promise<Response> {
  const { lead_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/sales/leads/${encodeURIComponent(lead_id)}/next-touch`,
    forwardQuery: false,
    errorLabel: "sales lead next touch",
  });
}
