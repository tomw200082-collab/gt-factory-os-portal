"use client";

// MaterialsThisWeekDrawer — "Materials this week" right-side drawer.
//
// Design spec: PDP-UX-01 § 4 + § 4a.
//
// Initial launch state: "unavailable" — backend weekly-materials endpoint
// does not yet exist. W4 must author the contract spec before this drawer
// can graduate to live data states.
//
// FORBIDDEN (locked in handoff packet § 4):
//   • Do NOT compute material requirements client-side by walking BOM lines.
//   • Do NOT call the single-BOM net-requirements endpoint and aggregate here.
//   • Do NOT display fake/placeholder material rows.
//   • Do NOT show exact quantities without source + freshness + basis visible.

import Link from "next/link";
import { Database } from "lucide-react";
import { Drawer } from "@/components/overlays/Drawer";
import { cn } from "@/lib/cn";
import type { MaterialsDrawerState } from "../_lib/types";
import { fmtWeekRange } from "../_lib/helpers";

export function MaterialsThisWeekDrawer({
  open,
  onClose,
  weekStart,
  weekEnd,
}: {
  open: boolean;
  onClose: () => void;
  weekStart: Date;
  weekEnd: Date;
}) {
  // Hard-coded to "unavailable" until backend endpoint is built and W4
  // contract is authored. State machine is wired up so the upgrade to live
  // data states (ready_covered, ready_shortages, etc.) only requires adding
  // the data-fetch hook here.
  const state: MaterialsDrawerState = "unavailable";
  const weekLabel = fmtWeekRange(weekStart, weekEnd);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Materials this week"
      description={weekLabel}
      width="lg"
    >
      <div className="flex flex-col gap-4 px-1">
        <MaterialsDrawerBody state={state} weekLabel={weekLabel} onClose={onClose} />
      </div>
    </Drawer>
  );
}

function MaterialsDrawerBody({
  state,
  weekLabel,
  onClose,
}: {
  state: MaterialsDrawerState;
  weekLabel: string;
  onClose: () => void;
}) {
  switch (state) {
    case "loading":
      return <LoadingState />;
    case "ready_covered":
    case "ready_shortages":
    case "ready_no_plans":
    case "ready_missing_bom":
    case "stale":
    case "error":
      // These states are never reachable until the backend endpoint exists.
      // They are wired up here so the component accepts the full type union
      // and the upgrade to live data only requires the fetch hook.
      return <UnavailableState weekLabel={weekLabel} onClose={onClose} />;
    case "unavailable":
    default:
      return <UnavailableState weekLabel={weekLabel} onClose={onClose} />;
  }
}

function LoadingState() {
  return (
    <div
      className="space-y-2"
      aria-busy="true"
      aria-live="polite"
      aria-label="Calculating material requirements"
    >
      <div className="text-sm text-fg-muted font-medium mb-3">
        Calculating material requirements…
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-14 w-full animate-pulse rounded-md bg-bg-subtle"
        />
      ))}
    </div>
  );
}

// Unavailable state — honest "backend pending" messaging.
// § 4 state #6. No fake quantities. No placeholder rows.
function UnavailableState({
  weekLabel,
  onClose,
}: {
  weekLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-6 py-8 px-4">
      {/* Icon */}
      <div className="relative">
        <div
          className={cn(
            "h-14 w-14 rounded-2xl flex items-center justify-center",
            "bg-bg-muted border border-border/40",
          )}
        >
          <Database className="h-6 w-6 text-fg-faint" strokeWidth={1.5} />
        </div>
        <div
          className={cn(
            "absolute -bottom-1 -right-1 h-5 w-5 rounded-full",
            "bg-bg-raised border border-border/40 flex items-center justify-center",
          )}
          aria-hidden
        >
          <span className="text-[9px] font-bold text-warning-fg">!</span>
        </div>
      </div>

      {/* Primary message — exact copy from handoff packet § 4 state #6 */}
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-fg-strong leading-snug">
          Weekly material calculation requires a verified materials endpoint.
        </h3>
        <p className="text-sm text-fg-muted leading-relaxed max-w-xs mx-auto">
          This feature is in development. A verified backend data source is needed
          before material requirements can be computed for the week.
        </p>
      </div>

      {/* Data summary — honest state, no invented quantities */}
      <div
        className={cn(
          "w-full rounded-lg border border-border/40 bg-bg-subtle",
          "divide-y divide-border/30 text-sm",
        )}
      >
        <div className="flex items-center justify-between px-4 py-2.5 gap-3">
          <span className="text-fg-muted font-medium">Selected week</span>
          <span className="text-fg-strong font-semibold tabular-nums">
            {weekLabel.replace("Week of ", "")}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 gap-3">
          <span className="text-fg-muted font-medium">Calculation basis</span>
          <span className="text-fg-subtle italic">unavailable</span>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 gap-3">
          <span className="text-fg-muted font-medium">Source</span>
          <span className="text-fg-subtle italic">pending verified backend data</span>
        </div>
      </div>

      {/* Footnote — links to existing per-card BOM impact as an alternative */}
      <p className="text-xs text-fg-faint leading-relaxed max-w-xs">
        For per-item material impact, open a production card and use{" "}
        <button
          type="button"
          className="text-accent hover:underline font-medium"
          onClick={onClose}
        >
          Inventory impact
        </button>{" "}
        to see what a single plan requires.
      </p>

      {/* Per-card BOM impact link */}
      <div className="text-xs text-fg-faint">
        <Link
          href="/planning/inventory-flow"
          className="text-accent hover:underline"
        >
          Check current stock levels in Inventory Flow →
        </Link>
      </div>
    </div>
  );
}
