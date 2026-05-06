import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/inventory/supply-flow/sku/[skuKind]/[skuId]
//   → upstream /api/v1/queries/inventory/supply-flow/sku/{skuKind}/{skuId}.
//
// Per-SKU drill-down for the supply universe. The portal page that consumes
// this is deferred to v2 (per the plan's YAGNI note); the proxy is wired so
// the backend route is reachable without a code change later.
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ skuKind: string; skuId: string }> },
): Promise<Response> {
  const { skuKind, skuId } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/inventory/supply-flow/sku/${encodeURIComponent(skuKind)}/${encodeURIComponent(skuId)}`,
    forwardQuery: false,
    errorLabel: "supply flow detail",
  });
}
