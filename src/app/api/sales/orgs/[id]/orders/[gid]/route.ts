import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/orgs/:id/orders/:gid → GET /api/v1/queries/sales/orgs/:id/orders/:gid
// The gid is a full Shopify id (gid://shopify/Order/123), so it travels encoded.
// Decoding first keeps this right whether or not the router already decoded it.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; gid: string }> },
): Promise<Response> {
  const { id, gid } = await params;
  let raw = gid;
  try {
    raw = decodeURIComponent(gid);
  } catch {
    /* a malformed escape goes upstream as is and is refused there (400) */
  }
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/sales/orgs/${encodeURIComponent(id)}/orders/${encodeURIComponent(raw)}`,
    forwardQuery: false,
    errorLabel: "sales org order",
  });
}
