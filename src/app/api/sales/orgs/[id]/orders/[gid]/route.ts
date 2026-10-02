import { proxyRequest } from "@/lib/api-proxy";
import { badId, isOrderGid, isUuid } from "@/app/api/sales/_ids";

// GET /api/sales/orgs/:id/orders/:gid → GET /api/v1/queries/sales/orgs/:id/orders/:gid
// The gid is a full Shopify id (gid://shopify/Order/123), so it travels encoded.
// It is checked whole (decoded once) before it is forwarded: anything else is a 400 here.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; gid: string }> },
): Promise<Response> {
  const { id, gid } = await params;
  let raw: string;
  try {
    raw = decodeURIComponent(gid);
  } catch {
    return badId();
  }
  if (!isUuid(id) || !isOrderGid(raw)) return badId();
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/sales/orgs/${encodeURIComponent(id)}/orders/${encodeURIComponent(raw)}`,
    forwardQuery: false,
    errorLabel: "sales org order",
  });
}
