"use client";

// ---------------------------------------------------------------------------
// Placement queue — portal data layer (tranche 086 Part A).
//
// The office manager's "orders to place" worklist. Reads POs the planner
// approved into APPROVED_TO_ORDER (no backend schema change — the existing
// list endpoint filters any status), reads a PO's lines on demand, and posts
// the place-order mutation (APPROVED_TO_ORDER → OPEN with payment terms +
// per-line prices).
// ---------------------------------------------------------------------------

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface QueuePo {
  po_id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string | null;
  status: string;
  expected_receive_date: string | null;
  currency: string;
  total_net: string;
  // 0261 enrichment from the originating session PO (null for manual POs):
  // order_by_date drives the urgency sort; order_document_text is the
  // paste-ready Hebrew supplier message.
  order_by_date: string | null;
  tier: string | null;
  order_document_text: string | null;
}

interface QueueResponse {
  rows: QueuePo[];
  count: number;
}

export interface QueuePoLine {
  po_line_id: string;
  line_number: number;
  component_name: string | null;
  item_name: string | null;
  component_id: string | null;
  item_id: string | null;
  ordered_qty: string;
  uom: string;
  line_status: string;
  // Present when the line already carries a snapshot/std price; used as the
  // suggested unit price in the placement form. May be absent.
  unit_price_net?: string | null;
}

interface LinesResponse {
  rows: QueuePoLine[];
}

export interface PlaceArgs {
  poId: string;
  payment_terms: string | null;
  payment_terms_net_days: number | null;
  payment_terms_eom: boolean | null;
  line_prices: { po_line_id: string; unit_price_net: number }[];
  confirm_price_update?: boolean;
  // 0261: supplier-confirmed arrival date the office manager records at
  // placement (ISO YYYY-MM-DD). Optional per-line qty adjustments too.
  expected_receive_date?: string | null;
  line_qty_overrides?: { po_line_id: string; ordered_qty: number }[];
}

const QUEUE_KEY = ["po-placement-queue"] as const;

// Marks an error whose .message is operator-safe (Hebrew, or backend-provided
// detail) — thrown only by jsonOrThrow below. Any other error (network
// failure, an unguarded runtime TypeError) must never have its raw .message
// shown on this Hebrew-only surface — see DR-018 ux-release-gate INTER-002.
export class ApiError extends Error {}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `po_place_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function jsonOrThrow(res: Response, fallback: string): Promise<unknown> {
  if (res.status === 401) throw new ApiError("ההתחברות פגה — יש להתחבר מחדש.");
  if (res.status === 403) throw new ApiError("אין לך הרשאה לבצע פעולה זו.");
  if (res.status === 503)
    throw new ApiError("הכתיבה מושהית כעת. נסו שוב מאוחר יותר; אם הבעיה נמשכת, פנו למנהל המערכת.");
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = body as
      | { reason_code?: string; detail?: string; error?: string }
      | null;
    // Operator-facing: never surface a raw reason_code enum or HTTP status.
    // Prefer the backend's human detail, else the Hebrew fallback sentence.
    const msg = b?.detail ?? b?.error ?? fallback;
    throw new ApiError(String(msg));
  }
  return body;
}

export function usePlacementQueue() {
  return useQuery({
    queryKey: QUEUE_KEY,
    queryFn: async (): Promise<QueueResponse> => {
      const res = await fetch(
        "/api/purchase-orders?status=APPROVED_TO_ORDER&limit=200",
        { headers: { Accept: "application/json" } },
      );
      const data = (await jsonOrThrow(
        res,
        "לא ניתן לטעון את תור ההזמנות.",
      )) as QueueResponse;
      // Defensive: a 200 response with a malformed/missing rows field must
      // never crash the page — see DR-018 ux-release-gate FLOW-011.
      const rows = data.rows ?? [];
      // FLOW-005: most-urgent-first. Sort by order-by date asc (nulls last —
      // manual POs without a session origin), then po_number for stability.
      rows.sort((a, b) => {
        const ax = a.order_by_date ?? "9999-12-31";
        const bx = b.order_by_date ?? "9999-12-31";
        return ax < bx ? -1 : ax > bx ? 1 : a.po_number.localeCompare(b.po_number);
      });
      return { ...data, rows };
    },
    staleTime: 30_000,
    retry: false,
    // FLOW-001: don't silently refetch (and discard in-progress price/term/date
    // edits in an expanded row) when the window regains focus.
    refetchOnWindowFocus: false,
  });
}

export function usePoLines(poId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["po-placement-queue", "lines", poId],
    queryFn: async (): Promise<LinesResponse> => {
      const res = await fetch(
        `/api/purchase-order-lines?po_id=${encodeURIComponent(poId)}`,
        { headers: { Accept: "application/json" } },
      );
      return (await jsonOrThrow(
        res,
        "לא ניתן לטעון את שורות ההזמנה.",
      )) as LinesResponse;
    },
    enabled,
    staleTime: 30_000,
  });
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: PlaceArgs) => {
      const res = await fetch(
        `/api/purchase-orders/${encodeURIComponent(args.poId)}/place`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotency_key: newIdempotencyKey(),
            payment_terms: args.payment_terms,
            payment_terms_net_days: args.payment_terms_net_days,
            payment_terms_eom: args.payment_terms_eom,
            line_prices: args.line_prices,
            confirm_price_update: args.confirm_price_update ?? true,
            expected_receive_date: args.expected_receive_date ?? null,
            line_qty_overrides: args.line_qty_overrides ?? undefined,
          }),
        },
      );
      return jsonOrThrow(res, "ביצוע ההזמנה נכשל.");
    },
    onSuccess: () => {
      // A placed PO leaves the queue and becomes a real OPEN order visible to
      // the PO list, PO detail, and the goods-receipt open-PO picker.
      void qc.invalidateQueries({ queryKey: QUEUE_KEY });
      // Prefix match — invalidates every ["planner","purchase-orders", <status>]
      // query on the PO list regardless of its status-filter suffix.
      void qc.invalidateQueries({ queryKey: ["planner", "purchase-orders"] });
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      void qc.invalidateQueries({ queryKey: ["ops", "receipts", "open-pos"] });
    },
  });
}
