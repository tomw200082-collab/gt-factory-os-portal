import { proxyRequest } from "@/lib/api-proxy";

// GET /api/sales/control/access → GET /api/v1/queries/sales/control/access
// { can_control } for the signed-in session (D-045): the nav shows the control-room entry from
// this flag, so the client never carries the email it is decided by.

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/sales/control/access",
    forwardQuery: false,
    errorLabel: "sales control access",
  });
}
