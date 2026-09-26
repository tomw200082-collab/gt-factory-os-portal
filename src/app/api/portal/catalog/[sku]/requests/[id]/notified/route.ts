import { proxyRequest } from "@/lib/api-proxy";

// POST /api/portal/catalog/[sku]/requests/[id]/notified → POST /api/v1/mutations/portal/catalog/:sku/requests/:id/notified

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sku: string; id: string }> },
): Promise<Response> {
  const { sku, id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/portal/catalog/${encodeURIComponent(sku)}/requests/${encodeURIComponent(id)}/notified`,
    errorLabel: "portal restock request",
  });
}
