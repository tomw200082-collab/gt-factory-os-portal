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

function SummaryCard({
  title,
  tone,
  s,
}: {
  title: string;
  tone: "current" | "new";
  s: SupplierItemSummary;
}): JSX.Element {
  const surface =
    tone === "current"
      ? "border-border bg-bg-subtle"
      : "border-accent-border bg-accent-softer";
  return (
    <div className={`rounded-sm border ${surface} p-3`}>
      <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {title}
      </div>
      <div className="mt-1 text-sm font-medium text-fg-strong">
        {s.supplier_name}
      </div>
      <dl className="mt-2 space-y-0.5 text-xs">
        <div className="flex justify-between">
          <dt className="text-fg-muted">Cost</dt>
          <dd className="font-mono tabular-nums text-fg">
            {s.std_cost_per_inv_uom ?? "—"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-fg-muted">Lead time</dt>
          <dd className="font-mono tabular-nums text-fg">
            {s.lead_time_days ?? "—"}d
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-fg-muted">MOQ</dt>
          <dd className="font-mono tabular-nums text-fg">
            {s.moq ?? "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function SwapPrimaryConfirm({
  currentPrimary,
  newPrimary,
  onConfirm,
  onBack,
}: SwapPrimaryConfirmProps): JSX.Element {
  const [agreed, setAgreed] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg">
        Replace the current primary supplier. The previous primary will be
        demoted in the same operation.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SummaryCard title="Current primary" tone="current" s={currentPrimary} />
        <SummaryCard title="New primary" tone="new" s={newPrimary} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 border-border text-accent focus:ring-accent-ring"
        />
        <span className="text-fg">
          I confirm — set the new supplier as primary and demote the previous
          primary.
        </span>
      </label>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-sm border border-border bg-bg-raised px-3 py-1.5 text-sm text-fg hover:bg-bg-subtle"
        >
          Back
        </button>
        <button
          type="button"
          disabled={!agreed}
          onClick={onConfirm}
          className="rounded-sm border border-accent-border bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Confirm swap
        </button>
      </div>
    </div>
  );
}
