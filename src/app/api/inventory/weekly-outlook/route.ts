import { proxyRequest } from "@/lib/api-proxy";

// ---------------------------------------------------------------------------
// GET /api/inventory/weekly-outlook — DEPRECATED.
//
// Replaced by /api/inventory/flow as of 2026-04-26 per
// inventory_flow_contract.md §6.1 row 3. Kept alive 1 release.
//
// Upstream now returns header `Deprecation: true` (cycle 6.5 commit 9ae6683).
// proxyRequest() forwards content-type but NOT arbitrary upstream headers, so
// we explicitly mirror the deprecation signal on this proxy as well so portal
// callers (curl probes, deprecation tooling) see it locally too.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  const upstream = await proxyRequest(req, {
    method: "GET",
    upstreamPath: "/api/v1/queries/inventory/weekly-outlook",
    errorLabel: "inventory weekly-outlook (deprecated)",
  });
  // Re-stamp deprecation. Cloning headers + body keeps this idempotent if the
  // upstream proxyRequest helper later starts forwarding more headers.
  const headers = new Headers(upstream.headers);
  headers.set("Deprecation", "true");
  headers.set("Sunset", "after first release of /planning/inventory-flow");
  headers.set("Link", '</api/inventory/flow>; rel="successor-version"');
  const body = await upstream.text();
  return new Response(body, { status: upstream.status, headers });
}
