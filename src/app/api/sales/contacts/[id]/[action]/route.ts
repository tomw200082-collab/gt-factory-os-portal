import { NextResponse } from "next/server";
import { proxyRequest } from "@/lib/api-proxy";

// POST /api/sales/contacts/:id/:action → POST /api/v1/mutations/sales/contacts/:id/:action
// Managers only. The action is checked here so nothing but the four backend verbs
// can be forwarded under this path.

const ACTIONS = new Set(["verify", "reject", "promote", "redact"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
): Promise<Response> {
  const { id, action } = await params;
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return proxyRequest(req, {
    method: "POST",
    upstreamPath: `/api/v1/mutations/sales/contacts/${encodeURIComponent(id)}/${action}`,
    errorLabel: `sales contact ${action}`,
  });
}
