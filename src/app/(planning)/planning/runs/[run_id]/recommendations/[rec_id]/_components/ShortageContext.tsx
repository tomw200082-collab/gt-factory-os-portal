"use client";

// ---------------------------------------------------------------------------
// ShortageContext — explains why this recommendation was created
//
// English labels per Tom-locked 2026-05-01 portal-wide standard.
// Shows demand / on-hand / open POs / net shortage.
// ---------------------------------------------------------------------------

import { SectionCard } from "@/components/workflow/SectionCard";
import { cn } from "@/lib/cn";
import type { RecommendationDetailResponse } from "../_lib/types";

function parseQty(s: string): number {
  return parseFloat(s) || 0;
}

function fmtQty(s: string, unit: string | null): string {
  const n = parseQty(s);
  const formatted = Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2).replace(/\.?0+$/, "");
  return unit ? `${formatted} ${unit}` : formatted;
}

interface ShortageRowProps {
  label: string;
  value: string;
  unit?: string | null;
  bold?: boolean;
  danger?: boolean;
}

function ShortageRow({ label, value, unit, bold, danger }: ShortageRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt
        className={cn(
          "text-xs text-fg-muted",
          bold && "font-semibold text-fg",
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "font-mono text-xs tabular-nums",
          danger ? "font-bold text-danger-fg" : bold ? "font-semibold text-fg-strong" : "text-fg",
        )}
      >
        {fmtQty(value, unit ?? null)}
      </dd>
    </div>
  );
}

interface ShortageContextProps {
  rec: RecommendationDetailResponse;
}

export function ShortageContext({ rec }: ShortageContextProps) {
  const shortage = parseQty(rec.net_shortage_qty);
  const hasShortage = shortage > 0;

  return (
    <SectionCard
      eyebrow="Why this recommendation"
      title="What is driving this recommendation?"
      description={
        rec.supply_method === "MANUFACTURED"
          ? "Quantity computed from BOM components. See the component breakdown below."
          : rec.supply_method === "REPACK"
            ? "Repacked from an input component. See the component breakdown below."
            : "Bought finished — purchased directly from a supplier."
      }
    >
      <dl className="divide-y divide-border/40">
        <ShortageRow
          label="Demand"
          value={rec.demand_qty}
          unit={null}
        />
        <ShortageRow
          label="On hand"
          value={rec.on_hand_qty}
          unit={null}
        />
        <ShortageRow
          label="In open POs"
          value={rec.open_po_qty}
          unit={null}
        />
        <ShortageRow
          label="Net shortage"
          value={rec.net_shortage_qty}
          unit={null}
          bold
          danger={hasShortage}
        />
      </dl>

      {hasShortage && (
        <div className="mt-3 rounded border border-danger/30 bg-danger-softer/60 px-3 py-2 text-xs text-danger-fg">
          Shortage of{" "}
          <span className="font-mono font-bold">
            {fmtQty(rec.net_shortage_qty, null)}
          </span>{" "}
          units may lead to unmet demand.
        </div>
      )}

      {rec.supplier_id && (
        <div className="mt-3 text-xs text-fg-muted">
          <span className="font-semibold text-fg">Supplier: </span>
          {rec.supplier_name ?? rec.supplier_id}
        </div>
      )}
    </SectionCard>
  );
}

export function ShortageContextSkeleton() {
  return (
    <div className="card p-5 space-y-2">
      <div className="h-3 w-32 animate-pulse rounded bg-bg-subtle" />
      <div className="h-5 w-48 animate-pulse rounded bg-bg-subtle" />
      <div className="mt-3 space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex justify-between">
            <div className="h-3 w-24 animate-pulse rounded bg-bg-subtle" />
            <div className="h-3 w-16 animate-pulse rounded bg-bg-subtle" />
          </div>
        ))}
      </div>
    </div>
  );
}
