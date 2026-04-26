import { proxyRequest } from "@/lib/api-proxy";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ rec_id: string }> },
): Promise<Response> {
  const { rec_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/planning/recommendations/${encodeURIComponent(rec_id)}/detail`,
    errorLabel: "planning recommendation detail",
  });
}
