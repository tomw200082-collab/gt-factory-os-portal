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

interface RecDetailHeaderProps {
  rec: RecommendationDetailResponse;
}

export function RecDetailHeader({ rec }: RecDetailHeaderProps) {
  return (
    <WorkflowHeader
      eyebrow="פרטי המלצה"
      title={rec.item_name}
      description={rec.item_id}
      meta={
        <>
          {recTypeBadge(rec.rec_type)}
          {recStatusBadge(rec.rec_status)}
          {supplyMethodBadge(rec.supply_method)}
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
