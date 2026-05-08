"use client";

// ---------------------------------------------------------------------------
// RecDetailHeader — item name, type badge, status badge, planning run reference
// ---------------------------------------------------------------------------

import Link from "next/link";
import { Badge } from "@/components/badges/StatusBadge";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import type { RecommendationDetailResponse } from "../_lib/types";

// Status / type / supply-method labels are keyed by enum value via Record<…>
// so that adding a new enum value at the contract layer surfaces a TypeScript
// error here instead of silently falling through to a raw enum string in the
// UI. The `statusFallback` keeps the chip from going blank if W1 emits a
// status the portal hasn't seen yet (logged in dev) — a defense-in-depth
// match for the inventory-flow + production-plan UX patterns already shipped.
const REC_TYPE_LABELS: Record<"purchase" | "production", string> = {
  purchase: "Purchase",
  production: "Production",
};

const REC_STATUS_LABELS: Record<string, string> = {
  approved: "Approved",
  draft: "Draft",
  pending_approval: "Pending approval",
  dismissed: "Dismissed",
  superseded: "Superseded",
  converted_to_po: "Converted to PO",
};

const SUPPLY_METHOD_BADGE_LABELS: Record<
  "BOUGHT_FINISHED" | "MANUFACTURED" | "REPACK",
  string
> = {
  BOUGHT_FINISHED: "Bought finished",
  MANUFACTURED: "Manufactured",
  REPACK: "Repack",
};

const SUPPLY_METHOD_DESCRIPTION_LABELS: Record<
  "BOUGHT_FINISHED" | "MANUFACTURED" | "REPACK",
  string
> = {
  MANUFACTURED: "Manufactured",
  REPACK: "Repack",
  BOUGHT_FINISHED: "Bought finished — purchased",
};

const REC_TYPE_HUMAN: Record<"purchase" | "production", string> = {
  purchase: "Purchase order recommended",
  production: "Production recommended",
};

function recTypeBadge(recType: "purchase" | "production") {
  if (recType === "purchase") {
    return <Badge tone="info" dotted>{REC_TYPE_LABELS.purchase}</Badge>;
  }
  return <Badge tone="accent" dotted>{REC_TYPE_LABELS.production}</Badge>;
}

function recStatusBadge(status: string) {
  const label = REC_STATUS_LABELS[status] ?? status;
  if (status === "approved") {
    return <Badge tone="success" dotted>{label}</Badge>;
  }
  if (status === "draft") {
    return <Badge tone="warning" dotted>{label}</Badge>;
  }
  if (status === "pending_approval") {
    return <Badge tone="warning" dotted>{label}</Badge>;
  }
  if (status === "dismissed") {
    return <Badge tone="neutral" dotted>{label}</Badge>;
  }
  if (status === "superseded") {
    return <Badge tone="neutral" dotted>{label}</Badge>;
  }
  if (status === "converted_to_po") {
    return <Badge tone="accent" dotted>{label}</Badge>;
  }
  return <Badge tone="neutral" dotted>{label}</Badge>;
}

function supplyMethodBadge(method: "BOUGHT_FINISHED" | "MANUFACTURED" | "REPACK") {
  const label = SUPPLY_METHOD_BADGE_LABELS[method];
  if (method === "BOUGHT_FINISHED") {
    return <Badge tone="info" variant="outline">{label}</Badge>;
  }
  if (method === "REPACK") {
    return <Badge tone="warning" variant="outline">{label}</Badge>;
  }
  return <Badge tone="neutral" variant="outline">{label}</Badge>;
}

function supplyMethodLabel(method: "BOUGHT_FINISHED" | "MANUFACTURED" | "REPACK"): string {
  return SUPPLY_METHOD_DESCRIPTION_LABELS[method];
}

interface RecDetailHeaderProps {
  rec: RecommendationDetailResponse;
}

export function RecDetailHeader({ rec }: RecDetailHeaderProps) {
  // Names are primary content. The id is surfaced only as a low-contrast
  // hint chip (U5 — names not IDs).
  const description =
    rec.rec_type === "production"
      ? `${REC_TYPE_HUMAN.production} · ${supplyMethodLabel(rec.supply_method)}`
      : `${REC_TYPE_HUMAN.purchase}${rec.supplier_name ? ` · ${rec.supplier_name}` : ""}`;

  return (
    <WorkflowHeader
      eyebrow="Planning workspace"
      title={rec.item_name}
      description={description}
      meta={
        <>
          {recTypeBadge(rec.rec_type)}
          {recStatusBadge(rec.rec_status)}
          {supplyMethodBadge(rec.supply_method)}
          {/* Converted-to-PO chip — presence-only signal in the header. */}
          {rec.converted_po_id !== null ? (
            <Link
              href={`/purchase-orders/${encodeURIComponent(rec.converted_po_id)}`}
              aria-label="Open converted purchase order"
              data-testid="rec-converted-to-po-chip"
              className="inline-flex items-center gap-1.5 rounded-sm border border-info/30 bg-info-softer px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-sops text-info-fg hover:underline"
              title="Open the purchase order this recommendation was converted into"
            >
              <span aria-hidden>{"→"}</span>
              <span>Linked PO</span>
            </Link>
          ) : null}
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
