import { proxyRequest } from "@/lib/api-proxy";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ run_id: string }> },
): Promise<Response> {
  const { run_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/planning/runs/${encodeURIComponent(run_id)}/recommendations`,
    errorLabel: "planning run recommendations",
  });
}
