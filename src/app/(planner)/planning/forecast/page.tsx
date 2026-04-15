"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  FileDown,
  History,
  LineChart as LineChartIcon,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { ApprovalBanner } from "@/components/workflow/ApprovalBanner";
import { DiffNotice } from "@/components/workflow/DiffNotice";
import { FreshnessBadge } from "@/components/badges/FreshnessBadge";
import { Badge } from "@/components/badges/StatusBadge";
import { FormActionsBar } from "@/components/workflow/FormActionsBar";
import { SEED_FORECAST_DRAFT } from "@/lib/fixtures/forecast";
import { cn } from "@/lib/cn";
import { useHasRole } from "@/lib/auth/role-gate";

type CellKey = string;
type Cells = Record<CellKey, number>;

export default function ForecastWorkspacePage() {
  const canEdit = useHasRole("planner", "admin");
  const draft = SEED_FORECAST_DRAFT;
  const [cells, setCells] = useState<Cells>(() => {
    const out: Cells = {};
    for (const row of draft.rows) {
      for (const b of draft.buckets) {
        out[`${row.item_id}|${b}`] = row.cells[b] ?? 0;
      }
    }
    return out;
  });
  const [dirtyCount, setDirtyCount] = useState(0);
  const [family, setFamily] = useState<string | null>(null);
  const [staleDismissed, setStaleDismissed] = useState(false);

  const families = useMemo(
    () => Array.from(new Set(draft.rows.map((r) => r.family))),
    [draft.rows]
  );
  const rows = useMemo(
    () => (family ? draft.rows.filter((r) => r.family === family) : draft.rows),
    [draft.rows, family]
  );

  const familyTotals = useMemo(() => {
    const totals: Record<string, number[]> = {};
    for (const fam of families) totals[fam] = draft.buckets.map(() => 0);
    for (const row of draft.rows) {
      draft.buckets.forEach((b, i) => {
        totals[row.family][i] += cells[`${row.item_id}|${b}`] ?? 0;
      });
    }
    return totals;
  }, [cells, draft.buckets, draft.rows, families]);

  const grandTotal = useMemo(() => {
    return Object.values(cells).reduce((sum, v) => sum + v, 0);
  }, [cells]);

  const updateCell = (itemId: string, bucket: string, raw: string) => {
    if (!canEdit) return;
    const value = Number(raw);
    if (Number.isNaN(value) || value < 0) return;
    setCells((c) => ({ ...c, [`${itemId}|${bucket}`]: value }));
    setDirtyCount((n) => n + 1);
  };

  return (
    <>
      <WorkflowHeader
        eyebrow="Planning workspace"
        title="Forecast"
        description="Versioned judgment workspace over forecast_versions. Multi-cell editing with optimistic concurrency — this is a planning surface, not a form."
        meta={
          <>
            <Badge tone="warning" variant="solid">
              Draft v{draft.version_number}
            </Badge>
            <Badge tone="neutral" dotted>
              Horizon {draft.horizon_weeks}w
            </Badge>
            <Badge tone="neutral" dotted>
              {draft.bucket_granularity === "week" ? "Weekly" : "Monthly"} buckets
            </Badge>
            <FreshnessBadge
              label="Draft saved"
              lastAt={draft.audit.updated_at}
              warnAfterMinutes={60}
              compact
            />
          </>
        }
        actions={
          canEdit ? (
            <>
              <button className="btn btn-ghost btn-sm gap-1.5">
                <History className="h-3 w-3" strokeWidth={2} />
                History
              </button>
              <button className="btn btn-sm gap-1.5">
                <FileDown className="h-3 w-3" strokeWidth={2} />
                Export
              </button>
              <button className="btn btn-primary btn-sm gap-1.5">
                <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
                Publish version
              </button>
            </>
          ) : (
            <Badge tone="neutral">read-only</Badge>
          )
        }
      />

      <div className="space-y-5">
        {!staleDismissed ? (
          <DiffNotice
            title="Draft changed by another planner at 11:08"
            description="Alex saved 4 cells since you opened this draft. Reload to see them, or continue editing — your local values will overwrite on save."
            tone="warning"
            onReload={() => setStaleDismissed(true)}
            onDismiss={() => setStaleDismissed(true)}
          />
        ) : null}

        <ApprovalBanner
          tone="info"
          title="Publishing requires a secondary planner review"
          reason="All forecast publishes route through a second-pair check before the new version becomes active."
          threshold="planning_policy.forecast.publish.requires_approval = true"
        />

        <SectionCard
          eyebrow="Workspace"
          title={
            <span className="flex items-center gap-2">
              <LineChartIcon className="h-4 w-4 text-accent" strokeWidth={2} />
              {rows.length} SKU{rows.length === 1 ? "" : "s"} · {draft.buckets.length} buckets
            </span>
          }
          description="Click a cell to edit. Tab moves to the next bucket; Enter moves to the next row. Zero cells show as em-dashes."
          contentClassName="p-0"
          actions={
            <div className="flex items-center gap-1.5">
              <FilterChip
                label="All"
                active={family === null}
                onClick={() => setFamily(null)}
              />
              {families.map((f) => (
                <FilterChip
                  key={f}
                  label={f}
                  active={family === f}
                  onClick={() => setFamily(f)}
                />
              ))}
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="sticky left-0 z-[1] min-w-[240px] bg-bg-subtle/80 px-4 py-2.5 text-left backdrop-blur">
                    <div className="flex items-center gap-2">
                      <Calendar
                        className="h-3 w-3 text-fg-faint"
                        strokeWidth={2}
                      />
                      <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                        Item / bucket
                      </span>
                    </div>
                  </th>
                  {draft.buckets.map((b) => (
                    <th
                      key={b}
                      className="px-2 py-2.5 text-right font-mono text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
                    >
                      {b.replace("2026-", "")}
                    </th>
                  ))}
                  <th className="bg-bg-subtle/80 px-3 py-2.5 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {(family ? [family] : families).map((fam) => (
                  <FamilyGroup
                    key={fam}
                    family={fam}
                    rows={rows.filter((r) => r.family === fam)}
                    buckets={draft.buckets}
                    cells={cells}
                    totals={familyTotals[fam]}
                    canEdit={canEdit}
                    onChange={updateCell}
                  />
                ))}
                <tr className="border-t-2 border-border">
                  <td className="sticky left-0 z-[1] bg-bg-subtle/80 px-4 py-2.5 text-3xs font-semibold uppercase tracking-sops text-fg-strong">
                    Grand total
                  </td>
                  {draft.buckets.map((b) => {
                    const colTotal = draft.rows.reduce(
                      (s, r) => s + (cells[`${r.item_id}|${b}`] ?? 0),
                      0
                    );
                    return (
                      <td
                        key={b}
                        className="bg-bg-subtle/60 px-2 py-2.5 text-right font-mono text-2xs font-semibold tabular-nums text-fg-strong"
                      >
                        {colTotal.toLocaleString()}
                      </td>
                    );
                  })}
                  <td className="bg-accent-soft/70 px-3 py-2.5 text-right font-mono text-sm font-semibold tabular-nums text-accent">
                    {grandTotal.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <FormActionsBar
        leading={
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "dot",
                dirtyCount === 0 ? "bg-success" : "bg-warning animate-pulse-soft"
              )}
            />
            <span
              className={cn(
                "font-semibold",
                dirtyCount === 0 ? "text-fg-muted" : "text-warning-fg"
              )}
            >
              {dirtyCount === 0
                ? "No pending cell edits"
                : `${dirtyCount} local cell edit${dirtyCount === 1 ? "" : "s"} pending save`}
            </span>
          </div>
        }
        hint={
          canEdit
            ? undefined
            : "Read-only view. Switch to planner role to edit."
        }
        secondary={
          canEdit && dirtyCount > 0 ? (
            <button className="btn btn-ghost btn-sm gap-1.5">
              <RotateCcw className="h-3 w-3" strokeWidth={2} />
              Revert
            </button>
          ) : canEdit ? (
            <button className="btn btn-ghost btn-sm gap-1.5 text-danger">
              <Trash2 className="h-3 w-3" strokeWidth={2} />
              Discard draft
            </button>
          ) : null
        }
        primary={
          canEdit ? (
            <button
              className="btn btn-primary btn-sm"
              disabled={dirtyCount === 0}
            >
              Save {dirtyCount > 0 ? `${dirtyCount} ` : ""}change
              {dirtyCount === 1 ? "" : "s"}
            </button>
          ) : null
        }
      />
    </>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
        active
          ? "border-accent/50 bg-accent-soft text-accent"
          : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg"
      )}
    >
      {active ? (
        <span className="dot bg-accent" />
      ) : (
        <span className="dot bg-fg-faint/60" />
      )}
      {label}
    </button>
  );
}

function FamilyGroup({
  family,
  rows,
  buckets,
  cells,
  totals,
  canEdit,
  onChange,
}: {
  family: string;
  rows: {
    item_id: string;
    sku: string;
    name: string;
    family: string;
    cells: Record<string, number>;
  }[];
  buckets: string[];
  cells: Record<string, number>;
  totals: number[];
  canEdit: boolean;
  onChange: (itemId: string, bucket: string, raw: string) => void;
}) {
  return (
    <>
      <tr className="border-b border-border/60">
        <td
          colSpan={buckets.length + 2}
          className="sticky left-0 z-[1] bg-gradient-to-r from-bg-subtle/80 via-bg-subtle/40 to-transparent px-4 py-1.5"
        >
          <div className="flex items-center gap-2">
            <span className="dot bg-accent" />
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-strong">
              {family}
            </span>
            <span className="text-3xs text-fg-subtle">
              · {rows.length} SKU{rows.length === 1 ? "" : "s"}
            </span>
          </div>
        </td>
      </tr>
      {rows.map((row) => {
        const total = buckets.reduce(
          (sum, b) => sum + (cells[`${row.item_id}|${b}`] ?? 0),
          0
        );
        return (
          <tr
            key={row.item_id}
            className="group border-b border-border/40 transition-colors duration-150 hover:bg-bg-subtle/40"
          >
            <td className="sticky left-0 z-[1] bg-bg-raised px-4 py-1.5 group-hover:bg-bg-subtle/80">
              <div className="font-medium text-fg-strong">{row.name}</div>
              <div className="font-mono text-3xs uppercase tracking-sops text-fg-subtle">
                {row.sku}
              </div>
            </td>
            {buckets.map((b) => {
              const value = cells[`${row.item_id}|${b}`] ?? 0;
              const isZero = value === 0;
              return (
                <td key={b} className="p-0">
                  {canEdit ? (
                    <input
                      type="number"
                      min="0"
                      value={value}
                      onChange={(e) => onChange(row.item_id, b, e.target.value)}
                      className={cn(
                        "h-9 w-full min-w-[68px] border-0 bg-transparent px-2 text-right font-mono text-xs tabular-nums outline-none transition-colors duration-150 focus:bg-accent-soft focus:text-accent focus:shadow-[inset_0_0_0_2px_hsl(186_42%_24%_/_0.3)]",
                        isZero && "text-fg-faint"
                      )}
                    />
                  ) : (
                    <span
                      className={cn(
                        "block min-w-[68px] px-2 py-2 text-right font-mono text-xs tabular-nums",
                        isZero && "text-fg-faint"
                      )}
                    >
                      {isZero ? "—" : value}
                    </span>
                  )}
                </td>
              );
            })}
            <td className="bg-bg-subtle/40 px-3 text-right font-mono text-xs font-semibold tabular-nums text-fg-strong">
              {total.toLocaleString()}
            </td>
          </tr>
        );
      })}
      <tr className="border-b border-border/60">
        <td className="sticky left-0 z-[1] bg-bg-subtle/60 px-4 py-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          {family} total
        </td>
        {totals.map((t, i) => (
          <td
            key={i}
            className="bg-bg-subtle/30 px-2 py-1.5 text-right font-mono text-2xs font-semibold tabular-nums text-fg-muted"
          >
            {t.toLocaleString()}
          </td>
        ))}
        <td className="bg-bg-subtle/60 px-3 py-1.5 text-right font-mono text-2xs font-semibold tabular-nums text-fg-strong">
          {totals.reduce((a, b) => a + b, 0).toLocaleString()}
        </td>
      </tr>
    </>
  );
}
