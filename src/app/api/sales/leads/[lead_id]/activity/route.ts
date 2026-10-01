import { proxyRequest } from "@/lib/api-proxy";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ lead_id: string }> },
): Promise<Response> {
  const { lead_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/sales/leads/${encodeURIComponent(lead_id)}/activity`,
    forwardQuery: false,
    errorLabel: "sales lead activity",
  });
}
