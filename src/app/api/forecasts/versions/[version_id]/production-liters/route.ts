import { proxyRequest } from "@/lib/api-proxy";

// 2026-05-05 list-card polish — proxy to upstream
//   GET /api/v1/queries/forecasts/versions/:version_id/production-liters
// Returns per-month production liters totals (FG units × items.base_fill_qty_per_unit).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ version_id: string }> },
): Promise<Response> {
  const { version_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/forecasts/versions/${encodeURIComponent(version_id)}/production-liters`,
    errorLabel: "forecasts production-liters",
  });
}
