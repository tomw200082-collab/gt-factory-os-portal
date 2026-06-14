// ---------------------------------------------------------------------------
// Procurement — approved purchase-recommendation → PO conversion (Tranche 072).
//
// Completes the Tranche 045 demotion: planning runs become diagnostic-only and
// the recommendation→PO conversion moves here, onto the canonical procurement
// surface (the banner on /planning/runs already points "Order through
// Procurement →"). The convert-to-po backend endpoint + portal proxy already
// exist; this module just sources the approved-unconverted PURCHASE
// recommendations from the latest completed run and posts the conversion.
//
// Source pattern mirrors the inbox client (latest completed run → its recs) and
// the runs page (recommendations fetched by ?type=purchase, filtered by status
// client-side). Approve / dismiss of recommendations live in the Inbox.
// ---------------------------------------------------------------------------

function genIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** A purchase recommendation that has been approved but not yet converted. */
export interface PurchaseRecToConvert {
  recommendation_id: string;
  item_id: string | null;
  item_name: string | null;
  recommended_qty: string;
  uom: string | null;
  supplier_name: string | null;
  order_by_date: string | null;
  due_date: string | null;
}

interface RawRecRow {
  recommendation_id: string;
  recommendation_type: "purchase" | "production";
  recommendation_status: string;
  item_id: string | null;
  item_name: string | null;
  recommended_qty: string;
  uom: string | null;
  supplier_name: string | null;
  order_by_date: string | null;
  due_date: string | null;
  converted_to_po_id?: string | null;
}

interface RecsResponse {
  rows: RawRecRow[];
  count: number;
  total: number;
}

interface RunListResponse {
  rows: { run_id: string }[];
}

export interface ConvertToPOResult {
  po_id: string;
  po_number: string | null;
  idempotent_replay: boolean;
}

/**
 * Approved-but-unconverted PURCHASE recommendations from the latest completed
 * planning run. 404 / no run / empty at any step → [] (not an error).
 */
export async function fetchApprovedPurchaseRecs(
  signal?: AbortSignal,
): Promise<PurchaseRecToConvert[]> {
  const runsRes = await fetch("/api/planning/runs?status=completed&limit=1", {
    headers: { Accept: "application/json" },
    signal,
  });
  if (runsRes.status === 404) return [];
  if (!runsRes.ok) {
    throw new Error("לא ניתן לטעון את ריצת התכנון. בדוק את החיבור ונסה שוב.");
  }
  const runsData = (await runsRes.json()) as RunListResponse;
  const run = runsData.rows?.[0];
  if (!run) return [];

  const recsRes = await fetch(
    `/api/planning/runs/${encodeURIComponent(run.run_id)}/recommendations?type=purchase`,
    { headers: { Accept: "application/json" }, signal },
  );
  if (recsRes.status === 404) return [];
  if (!recsRes.ok) {
    throw new Error("לא ניתן לטעון את ההמלצות. בדוק את החיבור ונסה שוב.");
  }
  const recsData = (await recsRes.json()) as RecsResponse;

  return (recsData.rows ?? [])
    .filter(
      (r) =>
        r.recommendation_type === "purchase" &&
        r.recommendation_status === "approved" &&
        !r.converted_to_po_id,
    )
    .map((r) => ({
      recommendation_id: r.recommendation_id,
      item_id: r.item_id,
      item_name: r.item_name,
      recommended_qty: r.recommended_qty,
      uom: r.uom,
      supplier_name: r.supplier_name,
      order_by_date: r.order_by_date,
      due_date: r.due_date,
    }));
}

/** POST the conversion. Idempotent on the backend via idempotency_key. */
export async function convertRecToPO(id: string): Promise<ConvertToPOResult> {
  const res = await fetch(
    `/api/planning/recommendations/${encodeURIComponent(id)}/convert-to-po`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotency_key: genIdempotencyKey() }),
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let detail = "";
    try {
      detail = (JSON.parse(txt) as { detail?: string }).detail ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || "לא ניתן להמיר להזמנת רכש. נסה שוב.");
  }
  return (await res.json()) as ConvertToPOResult;
}
