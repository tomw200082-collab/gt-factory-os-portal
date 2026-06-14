"use client";

// ---------------------------------------------------------------------------
// RecommendationsToConvert (Tranche 072) — Hebrew/RTL procurement section that
// turns approved purchase recommendations into purchase orders. This is the
// canonical home of the recommendation→PO conversion after planning runs were
// made diagnostic-only (the runs banner points "Order through Procurement →").
//
// Approve / dismiss of recommendations live in the Inbox; this surface only
// converts already-approved purchase recs. On success it invalidates the
// procurement session and every downstream PO surface (PO list, goods-receipt
// open-PO dropdown) plus the inbox, closing the invalidation gaps the audit
// flagged (F1 / F2). Renders nothing when there is nothing to convert.
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, FileOutput, CheckCircle2 } from "lucide-react";
import { useConfirm } from "@/components/overlays/ConfirmDialog";
import {
  fetchApprovedPurchaseRecs,
  convertRecToPO,
  type PurchaseRecToConvert,
  type ConvertToPOResult,
} from "../_lib/recommendations";

const QK = ["procurement", "approved-purchase-recs"] as const;

export function RecommendationsToConvert(): JSX.Element | null {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [done, setDone] = useState<ConvertToPOResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recsQuery = useQuery({
    queryKey: QK,
    queryFn: ({ signal }) => fetchApprovedPurchaseRecs(signal),
    staleTime: 30_000,
  });

  const convertMut = useMutation({
    mutationFn: (recId: string) => convertRecToPO(recId),
    onSuccess: (result) => {
      setErrorMsg(null);
      setDone(result);
      void queryClient.invalidateQueries({ queryKey: QK });
      void queryClient.invalidateQueries({ queryKey: ["purchase-session"] });
      void queryClient.invalidateQueries({
        queryKey: ["planner", "purchase-orders"],
      });
      void queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      void queryClient.invalidateQueries({
        queryKey: ["ops", "receipts", "open-pos"],
      });
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (err: Error) => {
      setErrorMsg(err.message);
    },
  });

  if (recsQuery.isLoading) {
    return (
      <div
        className="card p-4"
        aria-busy="true"
        aria-label="טוען המלצות מאושרות"
        data-testid="procurement-recs-loading"
      >
        <div className="h-4 w-40 animate-pulse rounded bg-bg-subtle" />
      </div>
    );
  }
  if (recsQuery.isError) {
    return (
      <div
        className="card border-danger/40 p-4 text-sm text-danger-fg"
        role="alert"
      >
        {(recsQuery.error as Error)?.message ?? "לא ניתן לטעון המלצות מאושרות."}
      </div>
    );
  }

  const recs = recsQuery.data ?? [];
  // Nothing to convert and no fresh success to announce → render nothing.
  if (recs.length === 0 && !done) return null;

  async function handleConvert(rec: PurchaseRecToConvert) {
    const name = rec.item_name ?? "פריט";
    const qty = `${rec.recommended_qty}${rec.uom ? ` ${rec.uom}` : ""}`;
    const ok = await confirm({
      title: `ליצור הזמנת רכש עבור ${name}?`,
      description: `תיווצר הזמנת רכש (${qty}${
        rec.supplier_name ? ` · ${rec.supplier_name}` : ""
      }). פעולה זו אינה ניתנת לביטול מכאן.`,
      confirmLabel: "צור הזמנה",
      cancelLabel: "ביטול",
    });
    if (!ok) return;
    setDone(null);
    convertMut.mutate(rec.recommendation_id);
  }

  return (
    <section
      className="card space-y-3 p-4"
      data-testid="procurement-approved-recs"
    >
      {dialog}
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-fg-strong">
          המלצות רכש מאושרות
        </h2>
        <p className="text-xs text-fg-muted">
          המלצות שאושרו בתיבת הנכנס וממתינות להמרה להזמנת רכש.
        </p>
      </div>

      {done && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-md border border-success/40 bg-success-softer px-3 py-2 text-xs text-success-fg"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">
            {done.idempotent_replay ? "כבר הומר ל" : "ההמלצה הומרה ל"}
            {done.po_number ?? "הזמנה"}.
          </span>
          <Link
            href={`/purchase-orders/${encodeURIComponent(done.po_id)}`}
            className="font-semibold text-accent hover:underline"
          >
            פתח הזמנה ←
          </Link>
        </div>
      )}

      {errorMsg && (
        <div
          className="rounded-md border border-danger/40 bg-danger-softer px-3 py-2 text-xs text-danger-fg"
          role="alert"
        >
          {errorMsg}
        </div>
      )}

      {recs.length > 0 && (
        <ul className="divide-y divide-border/60">
          {recs.map((rec) => {
            const pending =
              convertMut.isPending &&
              convertMut.variables === rec.recommendation_id;
            return (
              <li
                key={rec.recommendation_id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-fg-strong">
                    {rec.item_name ?? "פריט לא ידוע"}
                  </div>
                  <div className="mt-0.5 text-xs text-fg-muted">
                    <span className="font-mono tabular-nums text-fg">
                      {rec.recommended_qty}
                      {rec.uom ? ` ${rec.uom}` : ""}
                    </span>
                    {rec.supplier_name ? <> · {rec.supplier_name}</> : null}
                    {rec.order_by_date ? <> · להזמין עד {rec.order_by_date}</> : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleConvert(rec)}
                  disabled={pending}
                  className="btn btn-primary btn-sm"
                  data-testid="procurement-convert-rec"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <FileOutput className="h-4 w-4" aria-hidden />
                  )}
                  המר להזמנה
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
