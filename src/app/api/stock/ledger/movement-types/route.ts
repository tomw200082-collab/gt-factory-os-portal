import { proxyRequest } from "@/lib/api-proxy";

// Movement-type registry passthrough (deepen 2026-06-25). The Movement Log page
// consumes this so it never hardcodes the movement_type enum / filter values.
// GET route handlers are dynamic by default under Next 15, so this always
// proxies upstream (no stale static cache); the client caches it with a long
// TanStack Query staleTime instead.
export async function GET(req: Request): Promise<Response> {
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/stock/ledger/movement-types",
    forwardQuery: false,
    errorLabel: "movement types",
  });
}
