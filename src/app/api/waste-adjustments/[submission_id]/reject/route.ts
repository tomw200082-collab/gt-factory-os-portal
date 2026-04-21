import { proxyRequest } from "@/lib/api-proxy";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ submission_id: string }> },
): Promise<Response> {
  const { submission_id } = await params;
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/waste-adjustments/${encodeURIComponent(submission_id)}/reject`,
    errorLabel: "waste-adjustments reject",
  });
}
