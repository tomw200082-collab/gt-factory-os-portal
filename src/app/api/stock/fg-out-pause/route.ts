import { proxyRequest } from "@/lib/api-proxy";

// Movement Log FG-out inventory-pause toggle. GET is any authenticated user
// (the paused banner renders for every role); POST is admin/planner only
// (enforced by the backend). Backend: gt-factory-os api/src/stock/fg-out-pause.

export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/stock/fg-out-pause",
    errorLabel: "delivery-stock pause state",
  });
}

export async function POST(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: "/api/v1/mutations/stock/fg-out-pause",
    forwardBody: true,
    errorLabel: "delivery-stock pause toggle",
  });
}
