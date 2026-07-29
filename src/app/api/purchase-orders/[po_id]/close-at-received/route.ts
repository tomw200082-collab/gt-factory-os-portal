import { proxyRequest } from "@/lib/api-proxy";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ po_id: string }> },
): Promise<Response> {
  const { po_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/purchase-orders/${encodeURIComponent(po_id)}/close-at-received`,
    errorLabel: "purchase-order close at received",
  });
}
