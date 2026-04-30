"use client";

// ---------------------------------------------------------------------------
// RecDetailHeader — item name, type badge, status badge, planning run reference
// ---------------------------------------------------------------------------

import { Badge } from "@/components/badges/StatusBadge";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import type { RecommendationDetailResponse } from "../_lib/types";

function recTypeBadge(recType: "purchase" | "production") {
  if (recType === "purchase") {
    return <Badge tone="info" dotted>רכש</Badge>;
  }
  return <Badge tone="accent" dotted>ייצור</Badge>;
}

function recStatusBadge(status: string) {
  if (status === "approved") {
    return <Badge tone="success" dotted>מאושר</Badge>;
  }
  if (status === "draft") {
    return <Badge tone="warning" dotted>טיוטה</Badge>;
  }
  if (status === "pending_approval") {
    return <Badge tone="warning" dotted>ממתין לאישור</Badge>;
  }
  if (status === "dismissed") {
    return <Badge tone="neutral" dotted>נדחה</Badge>;
  }
  if (status === "superseded") {
    return <Badge tone="neutral" dotted>הוחלף</Badge>;
  }
  if (status === "converted_to_po") {
    return <Badge tone="accent" dotted>הומר להזמנה</Badge>;
  }
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

function supplyMethodBadge(method: "BOUGHT_FINISHED" | "MANUFACTURED" | "REPACK") {
  if (method === "BOUGHT_FINISHED") {
    return <Badge tone="info" variant="outline">מוצר מוגמר (רכש)</Badge>;
  }
  if (method === "REPACK") {
    return <Badge tone="warning" variant="outline">אריזה מחדש</Badge>;
  }
  return <Badge tone="neutral" variant="outline">ייצור</Badge>;
}

function supplyMethodLabel(method: "BOUGHT_FINISHED" | "MANUFACTURED" | "REPACK"): string {
  if (method === "MANUFACTURED") return "ייצור";
  if (method === "REPACK") return "אריזה מחדש";
  return "פריט מוגמר לרכישה";
}

interface RecDetailHeaderProps {
  rec: RecommendationDetailResponse;
}

export function RecDetailHeader({ rec }: RecDetailHeaderProps) {
  // Description must NOT be the raw item_id. For purchase recs we surface
  // supplier; for production recs we surface the supply method label.
  // The bare SKU lives in the small monospace chip in `meta` below.
  const description =
    rec.rec_type === "production"
      ? `${rec.item_name} · ${supplyMethodLabel(rec.supply_method)}`
      : `${rec.item_name} · ${rec.supplier_name ?? "—"}`;

  return (
    <WorkflowHeader
      eyebrow="פרטי המלצה"
      title={rec.item_name}
      description={description}
      meta={
        <>
          {recTypeBadge(rec.rec_type)}
          {recStatusBadge(rec.rec_status)}
          {supplyMethodBadge(rec.supply_method)}
          <span
            className="inline-flex items-center gap-1 rounded border border-border-subtle bg-bg-subtle px-1.5 py-0.5 font-mono text-3xs text-fg-muted"
            title="מק״ט"
          >
            <span className="text-3xs uppercase tracking-sops text-fg-subtle">מק״ט</span>
            <span>{rec.item_id}</span>
          </span>
        </>
      }
    />
  );
}

export function RecDetailHeaderSkeleton() {
  return (
    <div className="space-y-2 pb-4">
      <div className="h-3 w-24 animate-pulse rounded bg-bg-subtle" />
      <div className="h-7 w-64 animate-pulse rounded bg-bg-subtle" />
      <div className="h-3 w-40 animate-pulse rounded bg-bg-subtle" />
      <div className="flex gap-2">
        <div className="h-5 w-16 animate-pulse rounded bg-bg-subtle" />
        <div className="h-5 w-16 animate-pulse rounded bg-bg-subtle" />
        <div className="h-5 w-24 animate-pulse rounded bg-bg-subtle" />
      </div>
    </div>
  );
}
