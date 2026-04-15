"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Clock,
  Flame,
  Pause,
  ShoppingCart,
  X,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { FreshnessBadge } from "@/components/badges/FreshnessBadge";
import { Badge } from "@/components/badges/StatusBadge";
import { DiffNotice } from "@/components/workflow/DiffNotice";
import { SearchFilterBar } from "@/components/data/SearchFilterBar";
import { FormActionsBar } from "@/components/workflow/FormActionsBar";
import { SEED_PURCHASE_RECS } from "@/lib/fixtures/recommendations";
import type { Urgency } from "@/lib/contracts/enums";
import { useHasRole } from "@/lib/auth/role-gate";

const URGENCY_STYLE: Record<
  Urgency,
  { tone: "danger" | "warning" | "neutral" | "accent"; label: string }
> = {
  critical: { tone: "danger", label: "Critical" },
  high: { tone: "warning", label: "High" },
  normal: { tone: "neutral", label: "Normal" },
  low: { tone: "accent", label: "Low" },
};

export default function PurchaseRecsPage() {
  const canAct = useHasRole("planner", "admin");
  const [query, setQuery] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<Urgency | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [localState, setLocalState] = useState<
    Record<string, "approved" | "rejected" | "held">
  >({});
  const [staleDismissed, setStaleDismissed] = useState(true);

  const recs = useMemo(
    () =>
      SEED_PURCHASE_RECS.filter((r) => {
        if (urgencyFilter && r.urgency !== urgencyFilter) return false;
        if (
          query &&
          !(
            r.component_name.toLowerCase().includes(query.toLowerCase()) ||
            r.supplier_name.toLowerCase().includes(query.toLowerCase())
          )
        ) {
          return false;
        }
        return true;
      }),
    [query, urgencyFilter]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, typeof recs>();
    for (const r of recs) {
      const arr = map.get(r.supplier_name) ?? [];
      arr.push(r);
      map.set(r.supplier_name, arr);
    }
    return Array.from(map.entries());
  }, [recs]);

  const toggleAll = (ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const approveSelected = () => {
    if (selected.size > 10) {
      const ok = window.confirm(
        `Approve ${selected.size} recommendations across multiple suppliers?`
      );
      if (!ok) return;
    }
    setLocalState((s) => {
      const next = { ...s };
      for (const id of selected) next[id] = "approved";
      return next;
    });
    setSelected(new Set());
  };

  const criticalCount = recs.filter((r) => r.urgency === "critical").length;

  return (
    <>
      <WorkflowHeader
        eyebrow="Planning workspace"
        title="Purchase recommendations"
        description="Review the latest planning-run output. Approved lines stage to PO creation — never autonomous orders."
        meta={
          <>
            <FreshnessBadge
              label="Latest run"
              lastAt="2026-04-14T05:00:00Z"
              compact
            />
            <Badge tone="neutral">Run 2026-04-14</Badge>
            {criticalCount > 0 ? (
              <Badge tone="danger" dotted>
                {criticalCount} critical
              </Badge>
            ) : null}
          </>
        }
      />

      <div className="space-y-5">
        {!staleDismissed ? (
          <DiffNotice
            title="Newer planning run available"
            description="A run started 2m ago. Keep working on the current view or reload to pick up the latest recommendations."
            tone="warning"
            onReload={() => setStaleDismissed(true)}
            onDismiss={() => setStaleDismissed(true)}
          />
        ) : null}

        <SectionCard
          eyebrow={`${grouped.length} supplier${grouped.length === 1 ? "" : "s"} · ${recs.length} line${recs.length === 1 ? "" : "s"}`}
          title="Decision queue"
          description="Select rows or groups, then approve, reject, or hold. Approvals stage into the PO Form — nothing is sent directly from here."
          contentClassName="p-0"
        >
          <div className="border-b border-border/60 px-5 py-3">
            <SearchFilterBar
              query={query}
              onQueryChange={setQuery}
              placeholder="Search component or supplier"
              chips={(["critical", "high", "normal", "low"] as Urgency[]).map(
                (u) => ({
                  key: u,
                  label: u,
                  active: urgencyFilter === u,
                  onToggle: () =>
                    setUrgencyFilter((c) => (c === u ? null : u)),
                })
              )}
            />
          </div>

          <div className="divide-y divide-border/60">
            {grouped.map(([supplier, rows]) => {
              const ids = rows.map((r) => r.id);
              const allSelected = ids.every((id) => selected.has(id));
              const someSelected =
                !allSelected && ids.some((id) => selected.has(id));
              const groupTotal = rows.length;
              return (
                <div key={supplier}>
                  <div className="flex items-center gap-3 bg-bg-subtle/50 px-5 py-2.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={(e) => toggleAll(ids, e.target.checked)}
                      disabled={!canAct}
                      className="h-3.5 w-3.5 accent-accent"
                    />
                    <div className="text-sm font-semibold text-fg-strong">
                      {supplier}
                    </div>
                    <span className="chip">
                      {groupTotal} line{groupTotal === 1 ? "" : "s"}
                    </span>
                  </div>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="w-10 px-3 py-1.5"></th>
                        <th className="px-3 py-1.5 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          Component
                        </th>
                        <th className="px-3 py-1.5 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          Recommend
                        </th>
                        <th className="px-3 py-1.5 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          On hand
                        </th>
                        <th className="px-3 py-1.5 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          Target receive
                        </th>
                        <th className="px-3 py-1.5 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          Urgency
                        </th>
                        <th className="px-3 py-1.5 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          Why
                        </th>
                        <th className="px-3 py-1.5 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          State
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const state = localState[r.id] ?? r.state;
                        const isSelected = selected.has(r.id);
                        const urgencyStyle = URGENCY_STYLE[r.urgency];
                        return (
                          <tr
                            key={r.id}
                            data-selected={isSelected}
                            className="group border-b border-border/40 last:border-b-0 transition-colors duration-150 hover:bg-bg-subtle/40 data-[selected=true]:bg-accent-soft/50"
                          >
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!canAct}
                                onChange={(e) =>
                                  setSelected((s) => {
                                    const next = new Set(s);
                                    if (e.target.checked) next.add(r.id);
                                    else next.delete(r.id);
                                    return next;
                                  })
                                }
                                className="h-3.5 w-3.5 accent-accent"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-medium text-fg-strong">
                                {r.component_name}
                              </div>
                              <div className="font-mono text-3xs uppercase tracking-sops text-fg-subtle">
                                {r.component_id}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-fg-strong">
                              {r.recommended_quantity}
                              <span className="ml-1 text-3xs uppercase text-fg-subtle">
                                {r.unit}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-fg-muted">
                              {r.on_hand}
                              <span className="ml-1 text-3xs uppercase text-fg-subtle">
                                {r.unit}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                                <Clock
                                  className="h-3 w-3 text-fg-faint"
                                  strokeWidth={2}
                                />
                                <span className="font-mono tabular-nums">
                                  {r.target_receive_date}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <Badge tone={urgencyStyle.tone} dotted>
                                {r.urgency === "critical" ? (
                                  <Flame
                                    className="h-2.5 w-2.5"
                                    strokeWidth={2.5}
                                  />
                                ) : null}
                                {urgencyStyle.label}
                              </Badge>
                            </td>
                            <td className="max-w-[280px] px-3 py-2.5 text-xs leading-snug text-fg-muted">
                              {r.reason}
                            </td>
                            <td className="px-3 py-2.5">
                              <RowStateBadge state={state} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <FormActionsBar
        leading={
          <div className="flex items-center gap-2">
            <ShoppingCart
              className="h-3.5 w-3.5 text-fg-subtle"
              strokeWidth={2}
            />
            <span className="font-semibold text-fg-strong">
              {selected.size}
            </span>
            <span className="text-fg-muted">
              selected {selected.size > 0 ? "for action" : ""}
            </span>
          </div>
        }
        hint={
          canAct
            ? "Approvals stage to PO Form. Rejects require a reason. Nothing is sent from this shell."
            : "Read-only view. Switch to planner role to act."
        }
        secondary={
          canAct ? (
            <>
              <button
                className="btn btn-ghost btn-sm gap-1.5 text-danger"
                disabled={selected.size === 0}
              >
                <X className="h-3 w-3" strokeWidth={2} />
                Reject
              </button>
              <button
                className="btn btn-ghost btn-sm gap-1.5"
                disabled={selected.size === 0}
              >
                <Pause className="h-3 w-3" strokeWidth={2} />
                Hold
              </button>
            </>
          ) : null
        }
        primary={
          canAct ? (
            <button
              className="btn btn-primary btn-sm gap-1.5"
              disabled={selected.size === 0}
              onClick={approveSelected}
            >
              <Check className="h-3 w-3" strokeWidth={2.5} />
              Approve
            </button>
          ) : null
        }
      />
    </>
  );
}

function RowStateBadge({
  state,
}: {
  state: "pending" | "approved" | "rejected" | "held";
}) {
  const config = {
    pending: { tone: "neutral", label: "Pending" },
    approved: { tone: "success", label: "Approved" },
    rejected: { tone: "danger", label: "Rejected" },
    held: { tone: "warning", label: "Held" },
  } as const;
  const c = config[state];
  return (
    <Badge
      tone={c.tone as "neutral" | "success" | "danger" | "warning"}
      dotted
    >
      {c.label}
    </Badge>
  );
}

