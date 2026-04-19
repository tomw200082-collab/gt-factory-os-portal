import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Portal proxy: POST /api/planning/recommendations/:id/dismiss
//   -> API POST /api/v1/mutations/planning/recommendations/:id/dismiss
//      (Phase 7.5 §3.5 dismiss action)
//
// Authored under W2 Mode B, scoped to PlanningRun.
// ---------------------------------------------------------------------------

const API_BASE =
  process.env.PLANNING_API_BASE ??
  process.env.FORECASTS_API_BASE ??
  process.env.EXCEPTIONS_API_BASE ??
  process.env.WASTE_ADJUSTMENTS_API_BASE ??
  process.env.GOODS_RECEIPTS_API_BASE ??
  "http://127.0.0.1:3333";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const fakeSession = req.headers.get("x-fake-session");
  if (!fakeSession) {
    return NextResponse.json(
      { error: "Missing X-Fake-Session (portal shim)" },
      { status: 401 },
    );
  }

  const { id } = await params;
  const bodyText = await req.text();

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_BASE}/api/v1/mutations/planning/recommendations/${encodeURIComponent(id)}/dismiss`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-Session": fakeSession,
        },
        body: bodyText,
      },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "planning recommendation dismiss upstream unreachable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const body = await upstream.text();
  const headers = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  return new NextResponse(body, { status: upstream.status, headers });
}
