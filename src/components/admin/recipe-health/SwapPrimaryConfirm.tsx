// SwapPrimaryConfirm — Action C step 2. Side-by-side current/new primary
// with a required confirm checkbox. Emits onConfirm to the parent which
// runs the same single PATCH used by Action A.

"use client";

import { useState } from "react";

interface SupplierItemSummary {
  supplier_item_id: string;
  supplier_name: string;
  std_cost_per_inv_uom: string | null;
  lead_time_days: number | null;
  moq: string | null;
}

interface SwapPrimaryConfirmProps {
  currentPrimary: SupplierItemSummary;
  newPrimary: SupplierItemSummary;
  onConfirm: () => void;
  onBack: () => void;
}

export function SwapPrimaryConfirm({
  currentPrimary,
  newPrimary,
  onConfirm,
  onBack,
}: SwapPrimaryConfirmProps): JSX.Element {
  const [agreed, setAgreed] = useState(false);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded border p-2">
          <div className="font-semibold">Current primary</div>
          <div>{currentPrimary.supplier_name}</div>
          <div>cost {currentPrimary.std_cost_per_inv_uom ?? "—"}</div>
          <div>lead {currentPrimary.lead_time_days ?? "—"}d</div>
          <div>MOQ {currentPrimary.moq ?? "—"}</div>
        </div>
        <div className="rounded border p-2">
          <div className="font-semibold">New primary</div>
          <div>{newPrimary.supplier_name}</div>
          <div>cost {newPrimary.std_cost_per_inv_uom ?? "—"}</div>
          <div>lead {newPrimary.lead_time_days ?? "—"}d</div>
          <div>MOQ {newPrimary.moq ?? "—"}</div>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        אני מאשר להחליף את הספק הראשי ולהוריד את הקודם
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="rounded border px-3 py-1">
          Back
        </button>
        <button
          type="button"
          disabled={!agreed}
          onClick={onConfirm}
          className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50"
        >
          Confirm swap
        </button>
      </div>
    </div>
  );
}
