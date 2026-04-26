"use client";

// ---------------------------------------------------------------------------
// OpenPOsCard — what is already ordered / on the way
//
// Shows open POs reducing the required quantity.
// If open_pos is empty → shows "אין הזמנות פתוחות רלוונטיות"
// ---------------------------------------------------------------------------

import Link from "next/link";
import { SectionCard } from "@/components/workflow/SectionCard";
import type { RecommendationDetailResponse } from "../_lib/types";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

function parseQty(s: string): number {
  return parseFloat(s) || 0;
}

function fmtQty(s: string): string {
  const n = parseQty(s);
  return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2).replace(/\.?0+$/, "");
}

interface OpenPOsCardProps {
  rec: RecommendationDetailResponse;
}

export function OpenPOsCard({ rec }: OpenPOsCardProps) {
  const hasPOs = rec.open_pos.length > 0;

  return (
    <SectionCard
      eyebrow="מה כבר בדרך"
      title="הזמנות פתוחות רלוונטיות"
      description={
        hasPOs
          ? `${rec.open_pos.length} הזמנה${rec.open_pos.length !== 1 ? "ות" : ""} פתוחה${rec.open_pos.length !== 1 ? "ות" : ""} הכלולות בחישוב`
          : undefined
      }
    >
      {!hasPOs ? (
        <div className="text-sm text-fg-muted">
          אין הזמנות פתוחות רלוונטיות
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    מספר הזמנה
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    ספק
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    כמות פתוחה
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    תאריך קבלה צפוי
                  </th>
                </tr>
              </thead>
              <tbody>
                {rec.open_pos.map((po) => (
                  <tr
                    key={po.po_id}
                    className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/purchase-orders/${encodeURIComponent(po.po_id)}`}
                        className="font-mono text-xs text-accent hover:underline"
                      >
                        {po.po_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-fg-muted">
                      {po.supplier_name ?? po.supplier_id}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-fg-strong">
                      {fmtQty(po.open_qty)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-fg-muted">
                      {fmtDate(po.expected_receive_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {rec.open_pos.map((po) => (
              <div key={po.po_id} className="rounded border border-border/60 bg-bg-raised p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Link
                    href={`/purchase-orders/${encodeURIComponent(po.po_id)}`}
                    className="font-mono text-xs text-accent hover:underline"
                  >
                    {po.po_number}
                  </Link>
                  <span className="font-mono text-xs font-semibold tabular-nums text-fg-strong">
                    {fmtQty(po.open_qty)}
                  </span>
                </div>
                <div className="text-xs text-fg-muted">
                  {po.supplier_name ?? po.supplier_id}
                </div>
                <div className="text-xs text-fg-muted">
                  תאריך קבלה: {fmtDate(po.expected_receive_date)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

export function OpenPOsCardSkeleton() {
  return (
    <div className="card p-5 space-y-3">
      <div className="h-3 w-32 animate-pulse rounded bg-bg-subtle" />
      <div className="h-5 w-48 animate-pulse rounded bg-bg-subtle" />
      <div className="h-20 w-full animate-pulse rounded bg-bg-subtle" />
    </div>
  );
}
