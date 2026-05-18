"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Phone, Truck, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/cn";
import type { MaterialComponentLine } from "./types";
import {
  CoverageBadge,
  DateChip,
  coverageRow,
  fmtQtyStr,
  isShortStatus,
} from "./shared";
import { ComponentCard } from "./ComponentCard";

// ---------------------------------------------------------------------------
// BySupplierView — components grouped under their primary supplier. Each
// supplier is a collapsible card; suppliers with something to order are listed
// first and open by default, so the planner sees the active work. Inside, a
// dense table on desktop (lg+) and stacked cards below the 1024px breakpoint.
// ---------------------------------------------------------------------------

interface SupplierGroup {
  key: string;
  supplierId: string | null;
  supplierName: string;
  supplierPhone: string | null;
  components: MaterialComponentLine[];
  toOrderCount: number;
  earliestNeeded: string | null;
}

const NO_SUPPLIER_KEY = "__no_supplier__";

function buildGroups(components: MaterialComponentLine[]): SupplierGroup[] {
  const map = new Map<string, SupplierGroup>();

  for (const c of components) {
    const key = c.supplier_id ?? NO_SUPPLIER_KEY;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        supplierId: c.supplier_id,
        supplierName:
          c.supplier_short ??
          (c.supplier_id ? c.supplier_id : "No supplier assigned"),
        supplierPhone: c.supplier_phone,
        components: [],
        toOrderCount: 0,
        earliestNeeded: null,
      };
      map.set(key, group);
    }
    group.components.push(c);
    if (isShortStatus(c.coverage_status)) {
      group.toOrderCount += 1;
      if (
        group.earliestNeeded === null ||
        c.first_needed_date < group.earliestNeeded
      ) {
        group.earliestNeeded = c.first_needed_date;
      }
    }
  }

  const groups = [...map.values()];
  for (const g of groups) {
    g.components.sort((a, b) => {
      // Short components first, then by the day they are first needed.
      const aShort = isShortStatus(a.coverage_status) ? 0 : 1;
      const bShort = isShortStatus(b.coverage_status) ? 0 : 1;
      if (aShort !== bShort) return aShort - bShort;
      const d = a.first_needed_date.localeCompare(b.first_needed_date);
      if (d !== 0) return d;
      return a.component_name.localeCompare(b.component_name);
    });
  }

  // Suppliers with orders first; then earliest need; "No supplier" last.
  groups.sort((a, b) => {
    if (a.key === NO_SUPPLIER_KEY) return 1;
    if (b.key === NO_SUPPLIER_KEY) return -1;
    if ((a.toOrderCount > 0) !== (b.toOrderCount > 0)) {
      return a.toOrderCount > 0 ? -1 : 1;
    }
    const ae = a.earliestNeeded ?? "9999-99-99";
    const be = b.earliestNeeded ?? "9999-99-99";
    if (ae !== be) return ae.localeCompare(be);
    return a.supplierName.localeCompare(b.supplierName);
  });

  return groups;
}

export function BySupplierView({
  components,
}: {
  components: MaterialComponentLine[];
}) {
  const groups = useMemo(() => buildGroups(components), [components]);

  // Open suppliers that have something to order; collapse fully-stocked ones.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(groups.filter((g) => g.toOrderCount === 0).map((g) => g.key)),
  );

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="divide-y divide-border/60">
      {groups.map((group) => {
        const isOpen = !collapsed.has(group.key);
        return (
          <div key={group.key} data-testid="supplier-group">
            <button
              type="button"
              onClick={() => toggle(group.key)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-bg-subtle/50 sm:px-5"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-fg-muted transition-transform",
                  !isOpen && "-rotate-90",
                )}
                strokeWidth={2.5}
                aria-hidden
              />
              <Truck
                className="h-4 w-4 shrink-0 text-fg-faint"
                strokeWidth={2}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-fg-strong">
                  <bdi>{group.supplierName}</bdi>
                </span>
                {group.supplierPhone ? (
                  <span className="flex items-center gap-1 text-2xs text-fg-faint">
                    <Phone className="h-3 w-3" strokeWidth={2} aria-hidden />
                    {group.supplierPhone}
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {group.toOrderCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-danger/40 bg-danger-softer/50 px-2.5 py-1 text-xs font-bold text-danger-fg">
                    <ShoppingCart
                      className="h-3.5 w-3.5"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    {group.toOrderCount} to order
                  </span>
                ) : (
                  <span className="rounded-md border border-success/40 bg-success-softer/40 px-2.5 py-1 text-xs font-bold text-success-fg">
                    All in stock
                  </span>
                )}
                <span className="hidden text-2xs font-semibold text-fg-faint sm:inline">
                  {group.components.length} item
                  {group.components.length === 1 ? "" : "s"}
                </span>
              </span>
            </button>

            {isOpen ? (
              <>
                {/* Desktop — dense table. */}
                <div className="hidden overflow-x-auto border-t border-border/50 bg-bg-subtle/20 lg:block">
                  <SupplierComponentTable components={group.components} />
                </div>
                {/* Mobile — stacked cards. */}
                <div className="flex flex-col gap-2 border-t border-border/50 bg-bg-subtle/20 p-3 lg:hidden">
                  {group.components.map((c) => (
                    <ComponentCard key={c.component_id} component={c} />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SupplierComponentTable({
  components,
}: {
  components: MaterialComponentLine[];
}) {
  return (
    <table className="w-full">
      <thead>
        <tr className="text-2xs font-bold uppercase tracking-sops text-fg-subtle">
          <th className="px-4 py-2 text-left sm:px-5">Component</th>
          <th className="px-4 py-2 text-left">First needed</th>
          <th className="px-4 py-2 text-right">Required</th>
          <th className="px-4 py-2 text-right">On hand</th>
          <th className="px-4 py-2 text-right">To order</th>
          <th className="px-4 py-2 text-left">Status</th>
        </tr>
      </thead>
      <tbody>
        {components.map((c) => {
          const netShortage = parseFloat(c.net_shortage_qty);
          return (
            <tr
              key={c.component_id}
              data-testid="supplier-component-row"
              className={cn(
                "border-t border-border/40",
                coverageRow(c.coverage_status),
              )}
            >
              <td className="px-4 py-3 sm:px-5">
                <div className="text-sm font-semibold text-fg-strong">
                  <bdi>{c.component_name}</bdi>
                </div>
                <div className="font-mono text-2xs text-fg-faint">
                  {c.component_class ? `${c.component_class} · ` : ""}
                  {c.component_id}
                </div>
              </td>
              <td className="px-4 py-3">
                <DateChip iso={c.first_needed_date} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-fg-muted">
                {fmtQtyStr(c.total_required_qty, c.component_uom)}{" "}
                <span className="text-2xs text-fg-faint">
                  {c.component_uom}
                </span>
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
                  <span className="text-sm font-semibold text-success-fg">
                    —
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <CoverageBadge status={c.coverage_status} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
