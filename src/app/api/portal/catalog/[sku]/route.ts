import { proxyRequest } from "@/lib/api-proxy";

// POST /api/portal/catalog/[sku] → POST /api/v1/mutations/portal/catalog/:sku

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sku: string }> },
): Promise<Response> {
  const { sku } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/portal/catalog/${encodeURIComponent(sku)}`,
    errorLabel: "portal catalogue change",
  });
}
