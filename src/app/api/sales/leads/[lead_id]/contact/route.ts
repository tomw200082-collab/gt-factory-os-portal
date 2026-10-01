import { proxyRequest } from "@/lib/api-proxy";

export async function PATCH(req: Request, { params }: { params: Promise<{ lead_id: string }> }): Promise<Response> {
  const { lead_id } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/sales/leads/${encodeURIComponent(lead_id)}/contact`,
    forwardQuery: false,
    errorLabel: "sales lead contact resolution",
  });
}
