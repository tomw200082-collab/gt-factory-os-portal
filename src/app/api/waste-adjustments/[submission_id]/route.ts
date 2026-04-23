import { proxyRequest } from "@/lib/api-proxy";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ submission_id: string }> },
): Promise<Response> {
  const { submission_id } = await params;
  return proxyRequest(req, {
    method: "GET",
    upstreamPath: `/api/v1/queries/waste-adjustments/${encodeURIComponent(submission_id)}`,
    errorLabel: "waste-adjustments detail",
  });
}
