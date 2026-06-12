"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Play, CalendarRange, AlertTriangle } from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { cn } from "@/lib/cn";
import { MaterialRequirementsResults } from "./MaterialRequirementsResults";
import { formatPlanDateLong } from "./shared";

// ---------------------------------------------------------------------------
// DateRangePlanShell — the "Date range plan" mode.
//
//   1. Pick a date range (or a quick preset).
//   2. Press Simulate.
//   3. The page pulls every planned production job in that range from the
//      daily production plan, explodes each one's recipe, and shows exactly
//      what raw materials and packaging must be purchased — netted against
//      on-hand stock, with the date each component is first needed.
//
// `draft*` is what the planner is editing; `committed` is what the last
// Simulate press locked in. Results recompute only on Simulate.
// ---------------------------------------------------------------------------

const MAX_RANGE_DAYS = 90;

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(d.getDate() + n);
  return out;
}

// Operator week is Sunday-first (matches the production-plan board convention).
function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setDate(d.getDate() - d.getDay());
  out.setHours(0, 0, 0, 0);
  return out;
}

interface Preset {
  label: string;
  range: () => { from: string; to: string };
}

const PRESETS: Preset[] = [
  {
    label: "This week",
    range: () => {
      const start = startOfWeek(new Date());
      return { from: toIso(start), to: toIso(addDays(start, 6)) };
    },
  },
  {
    label: "Next 2 weeks",
    range: () => {
      const today = new Date();
      return { from: toIso(today), to: toIso(addDays(today, 13)) };
    },
  },
  {
    label: "This month",
    range: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: toIso(first), to: toIso(last) };
    },
  },
];

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  return { from: toIso(today), to: toIso(addDays(today, 13)) };
}

function rangeError(from: string, to: string): string | null {
  if (!from || !to) return "Pick a start and end date.";
  // Parse as UTC midnight so the day-count never drifts across a DST
  // boundary — this mirrors the backend's `T00:00:00Z` range check exactly.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/;
  const f = m.exec(from);
  const t = m.exec(to);
  if (!f || !t) return "Pick a valid start and end date.";
  const fromMs = Date.UTC(+f[1], +f[2] - 1, +f[3]);
  const toMs = Date.UTC(+t[1], +t[2] - 1, +t[3]);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return "Pick a valid start and end date.";
  }
  if (toMs < fromMs) return "The end date must be on or after the start date.";
  const days = (toMs - fromMs) / 86_400_000;
  if (days > MAX_RANGE_DAYS) {
    return `The range is limited to ${MAX_RANGE_DAYS} days. Narrow the window.`;
  }
  return null;
}

function DateField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  testId: string;
}) {
  return (
    <label className="flex w-full flex-col gap-2 sm:w-auto">
      <span className="text-xs font-bold uppercase tracking-sops text-fg-subtle">
        {label}
      </span>
      <input
        type="date"
        className="h-12 w-full rounded-md border border-border/70 bg-bg-raised px-4 text-base font-semibold tabular-nums text-fg-strong outline-none transition-colors focus:border-accent sm:w-auto"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
    </label>
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function DateRangePlanShell() {
  // Tranche 063 (FLOW-A10) — the date range rides in ?from=/?to= so
  // navigating away (e.g. into procurement) and back never destroys the
  // setup. The page wraps the shells in <Suspense> (useSearchParams).
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = useMemo(defaultRange, []);
  const [draftFrom, setDraftFrom] = useState(() => {
    const v = searchParams.get("from");
    return v && ISO_DATE.test(v) ? v : initial.from;
  });
  const [draftTo, setDraftTo] = useState(() => {
    const v = searchParams.get("to");
    return v && ISO_DATE.test(v) ? v : initial.to;
  });
  const [committed, setCommitted] = useState<{ from: string; to: string } | null>(
    null,
  );

  const error = rangeError(draftFrom, draftTo);
  const canSimulate = error === null;

  function syncUrl(from: string, to: string): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", from);
    params.set("to", to);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function changeFrom(next: string): void {
    setDraftFrom(next);
    syncUrl(next, draftTo);
  }

  function changeTo(next: string): void {
    setDraftTo(next);
    syncUrl(draftFrom, next);
  }

  function applyPreset(p: Preset) {
    const r = p.range();
    setDraftFrom(r.from);
    setDraftTo(r.to);
    syncUrl(r.from, r.to);
  }

  function handleSimulate() {
    if (!canSimulate) return;
    setCommitted({ from: draftFrom, to: draftTo });
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        eyebrow="Step 1"
        title="Choose a planning window"
        description="Every planned production job between these dates is pulled from the daily production plan and exploded into its raw-material and packaging needs."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => {
              const r = p.range();
              const isActive = r.from === draftFrom && r.to === draftTo;
              return (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={isActive}
                  className={cn(
                    "rounded-md border px-3 py-2 text-xs font-semibold transition-colors",
                    isActive
                      ? "border-accent bg-accent-softer/50 text-accent"
                      : "border-border/70 bg-bg-raised text-fg-muted hover:border-accent hover:text-fg-strong",
                  )}
                  onClick={() => applyPreset(p)}
                  data-testid={`production-simulation-range-preset-${p.label
                    .toLowerCase()
                    .replace(/\s+/g, "-")}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-4">
            <DateField
              label="From"
              value={draftFrom}
              onChange={changeFrom}
              testId="production-simulation-range-from"
            />
            <span
              aria-hidden
              className="hidden pb-3.5 text-fg-faint sm:inline"
            >
              →
            </span>
            <DateField
              label="To"
              value={draftTo}
              onChange={changeTo}
              testId="production-simulation-range-to"
            />
            <button
              type="button"
              className="btn btn-primary h-12 w-full gap-2 px-6 text-base font-bold sm:w-auto"
              onClick={handleSimulate}
              disabled={!canSimulate}
              data-testid="production-simulation-range-simulate-button"
            >
              <Play className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              Simulate
            </button>
          </div>

          {error ? (
            <div
              role="alert"
              className="flex items-center gap-2 text-xs font-semibold text-danger-fg"
              data-testid="production-simulation-range-error"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              {error}
            </div>
          ) : (
            <p className="text-2xs text-fg-faint">
              Window:{" "}
              <span className="font-semibold text-fg-muted">
                {formatPlanDateLong(draftFrom)}
              </span>
              <span aria-hidden> → </span>
              <span className="sr-only"> to </span>
              <span className="font-semibold text-fg-muted">
                {formatPlanDateLong(draftTo)}
              </span>
            </p>
          )}
        </div>
      </SectionCard>

      {committed ? (
        <MaterialRequirementsResults from={committed.from} to={committed.to} />
      ) : (
        <div
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed",
            "border-border/70 bg-bg-subtle/30 px-6 py-14 text-center",
          )}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-bg-raised">
            <CalendarRange
              className="h-6 w-6 text-fg-muted"
              strokeWidth={1.75}
              aria-hidden
            />
          </span>
          <p className="text-base font-semibold text-fg-strong">
            No plan simulated yet
          </p>
          <p className="max-w-md text-sm text-fg-muted">
            Pick a date range, then press Simulate to see everything you need to
            buy for the production planned in that window.
          </p>
        </div>
      )}
    </div>
  );
}
