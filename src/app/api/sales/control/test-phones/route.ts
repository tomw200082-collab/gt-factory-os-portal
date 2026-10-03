import { proxyRequest } from "@/lib/api-proxy";

// PUT /api/sales/control/test-phones → PUT /api/v1/mutations/sales/control/test-phones
// The lead line's test phones (D-045). Tom only: the server answers 404 to anyone else.

export async function PUT(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "PUT",
    upstreamPath: "/api/v1/mutations/sales/control/test-phones",
    forwardQuery: false,
    errorLabel: "sales test phones",
  });
}
