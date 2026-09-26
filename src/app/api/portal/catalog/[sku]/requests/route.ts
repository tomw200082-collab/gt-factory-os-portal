import { proxyRequest } from "@/lib/api-proxy";

// GET /api/portal/catalog/[sku]/requests → GET /api/v1/queries/portal/catalog/:sku/requests

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sku: string }> },
): Promise<Response> {
  const { sku } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/portal/catalog/${encodeURIComponent(sku)}/requests`,
    errorLabel: "portal restock requests",
  });
}
