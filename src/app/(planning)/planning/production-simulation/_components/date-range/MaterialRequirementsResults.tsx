"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarOff,
  Truck,
  Boxes,
  PackageSearch,
  RotateCw,
  ShoppingCart,
} from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { cn } from "@/lib/cn";
import type { MaterialRequirementsResponse } from "./types";
import { formatPlanDateLong } from "./shared";
import { BySupplierView } from "./BySupplierView";
import { ByProductView } from "./ByProductView";

// ---------------------------------------------------------------------------
// MaterialRequirementsResults — fetches the date-range aggregation and renders
// the answer: a summary hero, then one of two cuts of the same data —
//   • By supplier — exactly what to order from each supplier.
//   • By product  — every component, with which products consume it and when.
// ---------------------------------------------------------------------------

interface Props {
  from: string;
  to: string;
}

type ViewMode = "supplier" | "product";

async function fetchMaterialRequirements(
  from: string,
  to: string,
): Promise<MaterialRequirementsResponse> {
  const url = `/api/production-plan/material-requirements?from=${encodeURIComponent(
    from,
  )}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { detail?: string; error?: string };
      detail = body.detail ?? body.error ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(
      detail ||
        `Could not load the material requirements (HTTP ${res.status}). Try again.`,
    );
  }
  return (await res.json()) as MaterialRequirementsResponse;
}

function StatPill({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "covered" | "short" | "neutral" | "muted";
}) {
  if (value === 0) return null;
  const toneCls =
    tone === "covered"
      ? "text-success-fg"
      : tone === "short"
        ? "text-danger-fg"
        : tone === "muted"
          ? "text-fg-muted"
          : "text-warning-fg";
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={cn("text-xl font-bold tabular-nums", toneCls)}>
        {value}
      </span>
      <span className="text-xs font-semibold text-fg-muted">{label}</span>
    </span>
  );
}

export function MaterialRequirementsResults({ from, to }: Props) {
  const [view, setView] = useState<ViewMode>("supplier");

  const query = useQuery<MaterialRequirementsResponse>({
    queryKey: ["production-simulation", "material-requirements", from, to],
    queryFn: () => fetchMaterialRequirements(from, to),
    staleTime: 30_000,
    throwOnError: false,
  });

  if (query.isLoading) {
    return (
      <SectionCard eyebrow="Step 2" title="Aggregating planned production…">
        <div role="status">
          <span className="sr-only">
            Aggregating planned production — this may take a few seconds.
          </span>
          <div className="space-y-2.5" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-9 animate-pulse rounded bg-bg-subtle/80"
              />
            ))}
          </div>
        </div>
      </SectionCard>
    );
  }

  if (query.isError) {
    return (
      <SectionCard eyebrow="Step 2" title="Simulation failed" tone="danger">
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5 text-sm text-danger-fg">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0"
              strokeWidth={2}
              aria-hidden
            />
            <p>
              {query.error instanceof Error
                ? query.error.message
                : "Could not aggregate the planned production. Try again."}
            </p>
          </div>
          <div>
            <button
              type="button"
              className="btn btn-sm gap-1.5"
              onClick={() => void query.refetch()}
              data-testid="production-simulation-range-retry"
            >
              <RotateCw className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              Try again
            </button>
          </div>
        </div>
      </SectionCard>
    );
  }

  const data = query.data!;

  // No planned production at all in the window.
  if (data.plans_total === 0) {
    return (
      <SectionCard eyebrow="Step 2" title="Nothing planned in this window">
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-bg-raised">
            <CalendarOff
              className="h-6 w-6 text-fg-muted"
              strokeWidth={1.75}
              aria-hidden
            />
          </span>
          <p className="text-base font-semibold text-fg-strong">
            No production is planned between {formatPlanDateLong(from)} and{" "}
            {formatPlanDateLong(to)}
          </p>
          <p className="max-w-md text-sm text-fg-muted">
            Add jobs on the daily production plan, or widen the date range, then
            simulate again.
          </p>
        </div>
      </SectionCard>
    );
  }

  const balancesLabel = data.balances_as_of
    ? new Date(data.balances_as_of).toLocaleString(undefined, {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const toOrderCount =
    data.components_partial +
    data.components_short +
    data.components_no_stock_data;

  return (
    <div className="flex flex-col gap-5">
      {/* Hero — the answer, stated plainly. */}
      <div className="rounded-lg border border-border/70 bg-gradient-to-b from-bg-raised to-bg/40 px-5 py-5 sm:px-6">
        <div className="text-2xs font-bold uppercase tracking-sops text-fg-subtle">
          Step 2 · Purchasing requirements
        </div>
        <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-fg-strong sm:text-3xl">
          {formatPlanDateLong(from)}
          <span className="px-1.5 font-normal text-fg-faint" aria-hidden>
            →
          </span>
          <span className="sr-only">to </span>
          {formatPlanDateLong(to)}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          <span className="font-semibold text-fg-strong">
            {data.plans_simulated}
          </span>{" "}
          production job{data.plans_simulated === 1 ? "" : "s"} simulated ·{" "}
          <span className="font-semibold text-fg-strong">
            {data.total_components}
          </span>{" "}
          distinct component{data.total_components === 1 ? "" : "s"} needed.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <StatPill
            value={data.components_covered}
            label="fully in stock"
            tone="covered"
          />
          <StatPill
            value={data.components_partial}
            label="partially short"
            tone="neutral"
          />
          <StatPill
            value={data.components_short}
            label="to order"
            tone="short"
          />
          <StatPill
            value={data.components_no_stock_data}
            label="no stock data"
            tone="muted"
          />
          {balancesLabel ? (
            <span className="ml-auto text-2xs text-fg-faint">
              On-hand as of{" "}
              <span className="font-mono text-fg-muted">{balancesLabel}</span>
            </span>
          ) : null}
        </div>
        {/* Tranche 065 (FLOW-A10) — when the window needs buying, bridge
            into the ordering corridor instead of dead-ending. */}
        {toOrderCount > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
            <Link
              href="/planning/procurement"
              className="btn btn-sm btn-primary gap-1.5"
              data-testid="production-simulation-range-go-procurement"
            >
              <ShoppingCart className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              Take this to procurement
            </Link>
            <Link
              href="/purchase-orders/new"
              className="text-xs font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline"
              data-testid="production-simulation-range-go-manual-po"
            >
              Create a manual purchase order →
            </Link>
          </div>
        ) : null}
      </div>

      {/* Skipped plans — visible so the planner knows what is NOT counted. */}
      {data.plans_skipped.length > 0 ? (
        <SectionCard
          tone="warning"
          eyebrow="Heads up"
          title={`${data.plans_skipped.length} planned job${
            data.plans_skipped.length === 1 ? "" : "s"
          } could not be included`}
          description="These jobs are not counted in the totals below. Fix the recipe data, then simulate again."
          contentClassName="p-0"
        >
          <ul className="divide-y divide-border/50">
            {data.plans_skipped.map((p) => (
              <li
                key={p.plan_id}
                className="flex flex-col gap-1 px-4 py-3 sm:px-5"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-fg-strong">
                    <bdi>{p.item_name ?? p.item_id ?? "Unknown item"}</bdi>
                  </span>
                  <span className="text-2xs text-fg-faint">
                    {formatPlanDateLong(p.plan_date)}
                  </span>
                </div>
                <p className="text-xs text-warning-fg">{p.reason}</p>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {/* Data warnings (mixed units, missing stock data, …). */}
      {data.warnings.length > 0 ? (
        <div className="space-y-1 rounded-md border border-warning/40 bg-warning-softer/40 px-4 py-3 text-xs text-warning-fg">
          {data.warnings.map((w, i) => (
            <div key={i}>
              <bdi>{w}</bdi>
            </div>
          ))}
        </div>
      ) : null}

      {/* View switcher + the chosen cut of the data. */}
      <SectionCard
        title="What you need to buy"
        description={
          view === "supplier"
            ? "Grouped by supplier — open a supplier to see exactly what to order from them."
            : "Every component across the plan, with the products that consume it and when."
        }
        actions={
          <div
            className="flex items-center gap-1 rounded-md border border-border/70 bg-bg-subtle/60 p-1"
            role="group"
            aria-label="Requirements view"
          >
            <ViewTab
              active={view === "supplier"}
              onClick={() => setView("supplier")}
              icon={<Truck className="h-4 w-4" strokeWidth={2} aria-hidden />}
              label="By supplier"
              testId="production-simulation-view-supplier"
            />
            <ViewTab
              active={view === "product"}
              onClick={() => setView("product")}
              icon={<Boxes className="h-4 w-4" strokeWidth={2} aria-hidden />}
              label="By product"
              testId="production-simulation-view-product"
            />
          </div>
        }
        contentClassName="p-0"
        footer={
          <div className="flex flex-col gap-1">
            <span>{data.availability_note}</span>
            <span className="text-fg-faint">{data.open_po_qty_note}</span>
          </div>
        }
      >
        {data.total_components === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <PackageSearch
              className="h-7 w-7 text-fg-faint"
              strokeWidth={1.75}
              aria-hidden
            />
            <p className="text-sm text-fg-muted">
              {data.plans_skipped.length > 0
                ? "None of the planned jobs could be simulated — resolve the issues listed above, then simulate again."
                : "The simulated jobs produced no component lines."}
            </p>
          </div>
        ) : view === "supplier" ? (
          <BySupplierView
            key={`${from}-${to}-supplier`}
            components={data.components}
          />
        ) : (
          <ByProductView
            key={`${from}-${to}-product`}
            components={data.components}
          />
        )}
      </SectionCard>

      {toOrderCount > 0 ? (
        <p className="px-1 text-2xs leading-relaxed text-fg-faint">
          The date next to each component is the first day a planned job
          consumes it. Coverage compares total demand against current on-hand
          balances only — it does not account for supplier lead times, open
          purchase orders, or stock committed to other runs.
        </p>
      ) : null}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "flex items-center gap-1.5 rounded px-3 py-2 text-xs font-bold transition-colors",
        active
          ? "bg-bg-raised text-fg-strong shadow-sm"
          : "text-fg-muted hover:text-fg-strong",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
