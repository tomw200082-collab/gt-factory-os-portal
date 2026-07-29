import { proxyRequest } from "@/lib/api-proxy";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ po_id: string }> },
): Promise<Response> {
  const { po_id } = await params;
  return proxyRequest(req, {
    method: "PATCH",
    upstreamPath: `/api/v1/mutations/purchase-orders/${encodeURIComponent(po_id)}/schedule`,
    errorLabel: "purchase-order schedule",
  });
}
