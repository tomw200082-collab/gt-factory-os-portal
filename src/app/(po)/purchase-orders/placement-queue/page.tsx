"use client";

// ---------------------------------------------------------------------------
// Placement queue — /purchase-orders/placement-queue (tranche 086 Part A).
//
// The office manager's (bookkeeping) "orders to place" worklist: POs the
// planner approved into APPROVED_TO_ORDER. She enters supplier-confirmed price
// + payment terms per PO and places the order (→ OPEN), which then flows to
// goods receipt. Hebrew + RTL operator surface (authorized in CLAUDE.md).
//
// Gate: planning:execute (planner + admin). There is no separate bookkeeper
// role in the locked role lattice; the office manager signs in as planner.
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  RefreshCw,
  ClipboardCheck,
  CheckCircle2,
  X,
} from "lucide-react";
import { RoleGate } from "@/lib/auth/role-gate";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { usePlacementQueue } from "./_lib/api";
import { PlacementRow } from "./_components/PlacementRow";

function QueueInner(): JSX.Element {
  const { data, isLoading, isError, error, refetch } = usePlacementQueue();
  const rows = data?.rows ?? [];
  // Durable success confirmation: a placed PO's row unmounts (it leaves the
  // queue), so the page owns the "order placed" banner.
  const [placed, setPlaced] = useState<{
    po_id: string;
    po_number: string;
  } | null>(null);

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <WorkflowHeader
        size="section"
        eyebrow="רכש"
        title="הזמנות לביצוע"
        description="הזמנות שאושרו וממתינות לביצוע מול הספק. הזינו מחיר ותנאי תשלום לכל הזמנה, ובצעו אותה — היא תיפתח ותעבור לקבלת סחורה."
      />

      {placed ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md border border-success/40 bg-success-softer px-4 py-3 text-sm text-success-fg"
          data-testid="placement-queue-success"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            ההזמנה <span className="font-semibold">{placed.po_number}</span>{" "}
            בוצעה ונפתחה.{" "}
            <Link
              href={`/purchase-orders/${encodeURIComponent(placed.po_id)}`}
              className="font-medium underline-offset-2 hover:underline"
              data-testid="placement-queue-success-po-link"
            >
              צפה בהזמנה
            </Link>{" "}
            ·{" "}
            <Link
              href="/stock/receipts"
              className="font-medium underline-offset-2 hover:underline"
              data-testid="placement-queue-success-receipts-link"
            >
              קבלת סחורה ←
            </Link>
          </span>
          <button
            type="button"
            onClick={() => setPlaced(null)}
            className="shrink-0 rounded p-0.5 text-success-fg hover:bg-success/10"
            aria-label="סגירת ההודעה"
            data-testid="placement-queue-success-dismiss"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div
          className="space-y-3"
          aria-busy="true"
          data-testid="placement-queue-loading"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-16 animate-pulse bg-bg-subtle/40" />
          ))}
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger-fg"
          data-testid="placement-queue-error"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="flex-1">
            {(error as Error)?.message ?? "לא ניתן לטעון את תור ההזמנות."}
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1 text-xs font-medium underline hover:no-underline"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            נסה שוב
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div
          className="card flex flex-col items-center gap-2 p-8 text-center"
          data-testid="placement-queue-empty"
        >
          <ClipboardCheck className="h-6 w-6 text-fg-muted" aria-hidden />
          <div className="text-sm font-semibold text-fg">אין הזמנות לביצוע</div>
          <div className="max-w-md text-xs text-fg-muted">
            כשתאושר הזמנת רכש היא תופיע כאן, ותוכלי להזין מחיר ותנאי תשלום ולבצע
            אותה מול הספק.
          </div>
        </div>
      ) : (
        <ul className="space-y-3" data-testid="placement-queue-list">
          {rows.map((po) => (
            <PlacementRow
              key={po.po_id}
              po={po}
              onPlaced={(p) =>
                setPlaced({ po_id: p.po_id, po_number: p.po_number })
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PlacementQueuePage(): JSX.Element {
  return (
    <RoleGate minimum="planning:execute">
      <QueueInner />
    </RoleGate>
  );
}
