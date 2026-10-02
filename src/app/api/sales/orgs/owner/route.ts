import { proxyRequest } from "@/lib/api-proxy";

// POST /api/sales/orgs/owner → POST /api/v1/mutations/sales/orgs/owner
// Managers only (the API refuses a rep): one owner for many orgs, one transaction.

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/sales/orgs/owner",
    errorLabel: "sales org owner",
  });
}
