import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/goods-receipts?po_id=<po_id>   — list, optionally filtered by PO
//   proxies → GET /api/v1/queries/goods-receipts
// POST /api/goods-receipts                — create GR submission
//   proxies → POST /api/v1/mutations/goods-receipts
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/goods-receipts",
    errorLabel: "goods-receipts list",
  });
}

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/goods-receipts",
    errorLabel: "goods-receipts create",
  });
}
