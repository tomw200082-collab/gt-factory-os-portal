// Base-batch reporting helpers.
//
// A base-batch production plan (production_plan.item_id NULL + a pack_manifest)
// plans one BASE liquid batch that is packed into N finished pack SKUs. The
// backend records production one pack-SKU at a time: each member report is a
// production_actual carrying from_plan_id = the base plan and item_id = a
// manifest member (link_kind base_batch_member). The batch is finished with an
// explicit close-batch mutation.
//
// The report page uses these pure helpers to (a) show per-member coverage so
// the operator sees which products still need reporting, (b) drive the
// guided "report each product" flow, and (c) prevent a duplicate member
// report on re-entry. All functions are pure so they can be unit-tested away
// from the 4k-line form component.

/** A pack-manifest member as it arrives from the plan list DTO. */
export interface ManifestMember {
  item_id: string;
  item_name: string | null;
  qty: string;
  uom: string | null;
}

/** A production_actual row as it arrives from the list endpoint, narrowed to
 *  the fields coverage needs. */
export interface CoverageActual {
  item_id: string;
  output_qty: string;
  reversed: boolean;
  from_plan_id?: string | null;
}

/** Per-member coverage: planned vs already-reported. */
export interface MemberCoverage {
  item_id: string;
  item_name: string | null;
  uom: string | null;
  plannedQty: number;
  reportedQty: number;
  reportedCount: number;
  /** max(0, planned − reported); 0 once fully covered. */
  remainingQty: number;
  /** true once at least one non-reversed report exists for this member. */
  reported: boolean;
}

export interface BatchProgress {
  members: MemberCoverage[];
  totalMembers: number;
  /** members with at least one non-reversed report. */
  reportedMembers: number;
  /** every member has at least one non-reversed report. */
  allReported: boolean;
  /** at least one member has a report (batch is partially done). */
  anyReported: boolean;
  /** first member (in manifest order) with no report yet, else null. */
  nextUnreportedItemId: string | null;
}

function toNum(v: string | null | undefined): number {
  const n = Number(v ?? "");
  return Number.isFinite(n) ? n : 0;
}

/**
 * Compute per-member coverage for a base batch from its manifest and the
 * production actuals linked to the plan.
 *
 * `actuals` are matched to the plan by from_plan_id when present (defensive —
 * the caller already filters server-side); reversed rows never count toward
 * coverage. Members are returned in manifest order so the UI is stable.
 */
export function computeBatchProgress(
  manifest: ManifestMember[],
  actuals: CoverageActual[],
  planId: string,
): BatchProgress {
  const byItem = new Map<string, { qty: number; count: number }>();
  for (const a of actuals) {
    if (a.reversed) continue;
    // When from_plan_id is present it must match; when absent (older API) we
    // trust the caller's server-side filter.
    if (a.from_plan_id != null && a.from_plan_id !== planId) continue;
    const prev = byItem.get(a.item_id) ?? { qty: 0, count: 0 };
    byItem.set(a.item_id, {
      qty: prev.qty + toNum(a.output_qty),
      count: prev.count + 1,
    });
  }

  const members: MemberCoverage[] = manifest.map((m) => {
    const cov = byItem.get(m.item_id) ?? { qty: 0, count: 0 };
    const plannedQty = toNum(m.qty);
    return {
      item_id: m.item_id,
      item_name: m.item_name,
      uom: m.uom,
      plannedQty,
      reportedQty: cov.qty,
      reportedCount: cov.count,
      remainingQty: Math.max(0, plannedQty - cov.qty),
      reported: cov.count > 0,
    };
  });

  const reportedMembers = members.filter((m) => m.reported).length;
  const nextUnreported = members.find((m) => !m.reported) ?? null;

  return {
    members,
    totalMembers: members.length,
    reportedMembers,
    allReported: members.length > 0 && reportedMembers === members.length,
    anyReported: reportedMembers > 0,
    nextUnreportedItemId: nextUnreported ? nextUnreported.item_id : null,
  };
}
