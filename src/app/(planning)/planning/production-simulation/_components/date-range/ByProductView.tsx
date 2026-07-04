"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Truck, CalendarClock } from "lucide-react";
import { cn } from "@/lib/cn";
import type { MaterialComponentLine, MaterialGroup } from "./types";
import {
  CoverageBadge,
  DateChip,
  coverageRow,
  fmtQtyStr,
  formatPlanDateLong,
  GROUP_LABEL,
  GROUP_ORDER,
  isShortStatus,
} from "./shared";
import { ComponentCard } from "./ComponentCard";

// ---------------------------------------------------------------------------
// ByProductView — every component across the plan, grouped by material type.
// Each component opens to the per-product breakdown the planner needs to trace
// a shortage. A dense table on desktop (lg+); stacked cards below the 1024px
// breakpoint so the data surface never scrolls sideways.
// ---------------------------------------------------------------------------

export function sortComponents(
  rows: MaterialComponentLine[],
): MaterialComponentLine[] {
  return [...rows].sort((a, b) => {
    const aShort = isShortStatus(a.coverage_status) ? 0 : 1;
    const bShort = isShortStatus(b.coverage_status) ? 0 : 1;
    if (aShort !== bShort) return aShort - bShort;
    const d = a.first_needed_date.localeCompare(b.first_needed_date);
    if (d !== 0) return d;
    return a.component_name.localeCompare(b.component_name);
  });
}

export function ByProductView({
  components,
}: {
  components: MaterialComponentLine[];
}) {
  const groups = useMemo(() => {
    return GROUP_ORDER.map((g) => ({
      group: g,
      rows: sortComponents(components.filter((c) => c.group === g)),
    })).filter((g) => g.rows.length > 0);
  }, [components]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      {/* Desktop — dense table. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/70 text-2xs font-bold uppercase tracking-sops text-fg-subtle">
              <th scope="col" className="px-4 py-3 text-left sm:px-5">Component</th>
              <th scope="col" className="px-4 py-3 text-left">First needed</th>
              <th scope="col" className="px-4 py-3 text-right">Required</th>
              <th scope="col" className="px-4 py-3 text-right">On hand</th>
              <th scope="col" className="px-4 py-3 text-right">To order</th>
              <th scope="col" className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ group, rows }) => (
              <GroupSection
                key={group}
                group={group}
                rows={rows}
                expanded={expanded}
                onToggle={toggle}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile — stacked cards, grouped by material type. */}
      <div className="flex flex-col gap-4 p-3 lg:hidden">
        {groups.map(({ group, rows }) => (
          <div key={group} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2 px-0.5">
              <span className="text-xs font-bold uppercase tracking-sops text-fg-strong">
                {GROUP_LABEL[group]}
              </span>
              <span className="text-2xs font-semibold text-fg-faint">
                {rows.length}
              </span>
            </div>
            {rows.map((c) => (
              <ComponentCard
                key={c.component_id}
                component={c}
                showSupplier
                expandable
                expanded={expanded.has(c.component_id)}
                onToggle={() => toggle(c.component_id)}
                detail={<ComponentDetail component={c} />}
              />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function GroupSection({
  group,
  rows,
  expanded,
  onToggle,
}: {
  group: MaterialGroup;
  rows: MaterialComponentLine[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <>
      <tr className="bg-bg-subtle/70">
        <th
          colSpan={6}
          className="px-4 py-2 text-left text-xs font-bold uppercase tracking-sops text-fg-strong sm:px-5"
        >
          {GROUP_LABEL[group]}
          <span className="ml-2 font-semibold text-fg-faint">
            {rows.length}
          </span>
        </th>
      </tr>
      {rows.map((c) => (
        <ComponentRow
          key={c.component_id}
          component={c}
          open={expanded.has(c.component_id)}
          onToggle={() => onToggle(c.component_id)}
        />
      ))}
    </>
  );
}

function ComponentRow({
  component: c,
  open,
  onToggle,
}: {
  component: MaterialComponentLine;
  open: boolean;
  onToggle: () => void;
}) {
  const netShortage = parseFloat(c.net_shortage_qty);

  return (
    <>
      <tr
        data-testid="product-component-row"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        className={cn(
          "cursor-pointer border-b border-border/40 transition-colors hover:bg-bg-subtle/40",
          coverageRow(c.coverage_status),
        )}
      >
        <td className="px-4 py-3 sm:px-5">
          <div className="flex items-start gap-2">
            <ChevronDown
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0 text-fg-muted transition-transform",
                !open && "-rotate-90",
              )}
              strokeWidth={2.5}
              aria-hidden
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-fg-strong">
                <bdi>{c.component_name}</bdi>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-mono text-2xs text-fg-faint">
                  {c.component_class ? `${c.component_class} · ` : ""}
                  {c.component_id}
                </span>
                {c.supplier_short ? (
                  <span className="inline-flex items-center gap-1 text-2xs text-fg-faint">
                    <Truck className="h-3 w-3" strokeWidth={2} aria-hidden />
                    <bdi>{c.supplier_short}</bdi>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <DateChip iso={c.first_needed_date} />
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-fg-muted">
          {fmtQtyStr(c.total_required_qty, c.component_uom)}{" "}
          <span className="text-2xs text-fg-faint">{c.component_uom}</span>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-fg-muted">
          {c.coverage_status === "no_stock_data"
            ? "—"
            : fmtQtyStr(c.on_hand_qty, c.component_uom)}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right">
          {netShortage > 0 ? (
            <>
              <span className="text-lg font-bold tabular-nums text-danger-fg">
                {fmtQtyStr(c.net_shortage_qty, c.component_uom)}
              </span>{" "}
              <span className="text-xs font-semibold text-fg-muted">
                {c.component_uom}
              </span>
            </>
          ) : (
            <span className="text-sm font-semibold text-success-fg">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <CoverageBadge status={c.coverage_status} />
        </td>
      </tr>

      {open ? (
        <tr className="border-b border-border/40 bg-bg-subtle/30">
          <td colSpan={6} className="px-4 py-4 sm:px-5">
            <ComponentDetail component={c} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ComponentDetail({
  component: c,
}: {
  component: MaterialComponentLine;
}) {
  return (
    <div className="flex flex-col gap-3">
      {c.shortage_date ? (
        <div className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger-softer/30 px-3 py-2 text-xs text-danger-fg">
          <CalendarClock className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          <span>
            On-hand stock runs short on{" "}
            <span className="font-bold">
              {formatPlanDateLong(c.shortage_date)}
            </span>{" "}
            — order before then.
          </span>
        </div>
      ) : null}

      <div>
        <div className="mb-1.5 text-2xs font-bold uppercase tracking-sops text-fg-subtle">
          Consumed by {c.sources.length} planned job
          {c.sources.length === 1 ? "" : "s"}
        </div>
        <ul className="divide-y divide-border/40 overflow-hidden rounded-md border border-border/50 bg-bg-raised">
          {c.sources.map((s) => (
            <li
              key={s.plan_id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-fg-strong">
                  <bdi>{s.item_name ?? "Unknown product"}</bdi>
                </div>
                <div className="text-2xs text-fg-faint">
                  {formatPlanDateLong(s.plan_date)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-sm font-bold tabular-nums text-fg-strong">
                  {fmtQtyStr(s.qty, c.component_uom)}
                </span>{" "}
                <span className="text-2xs text-fg-faint">
                  {c.component_uom}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
