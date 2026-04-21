import { proxyRequest } from "@/lib/api-proxy";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ version_id: string }> },
): Promise<Response> {
  const { version_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/forecasts/versions/${encodeURIComponent(version_id)}`,
    errorLabel: "forecasts version detail",
  });
}
