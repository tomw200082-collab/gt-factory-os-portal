"use client";

import { useState } from "react";
import { FlaskConical, CalendarRange } from "lucide-react";
import { cn } from "@/lib/cn";
import { ProductionSimulatorShell } from "./ProductionSimulatorShell";
import { DateRangePlanShell } from "./date-range/DateRangePlanShell";

// ---------------------------------------------------------------------------
// SimulationModeShell — top-level switch between the two ways to use this page:
//
//   • Single product — what-if one product at a target quantity (the original
//     simulator).
//   • Date range plan — aggregate every job planned in a date range and show
//     exactly what to buy, by supplier or by product, with first-needed dates.
//
// Both subtrees stay mounted; the inactive one is hidden rather than
// unmounted, so switching modes never discards an in-progress simulation.
// ---------------------------------------------------------------------------

type Mode = "single" | "range";

const MODES: { id: Mode; label: string; hint: string; icon: typeof FlaskConical }[] =
  [
    {
      id: "single",
      label: "Single product",
      hint: "One product, one target quantity",
      icon: FlaskConical,
    },
    {
      id: "range",
      label: "Date range plan",
      hint: "Everything planned across a date range",
      icon: CalendarRange,
    },
  ];

export function SimulationModeShell() {
  const [mode, setMode] = useState<Mode>("single");

  return (
    <div className="mt-5 flex flex-col gap-5">
      <div
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        role="group"
        aria-label="Simulation mode"
      >
        {MODES.map((m) => {
          const active = mode === m.id;
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={active}
              onClick={() => setMode(m.id)}
              data-testid={`production-simulation-mode-${m.id}`}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                active
                  ? "border-accent bg-accent-softer/40 shadow-sm"
                  : "border-border/70 bg-bg-raised hover:border-border",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border",
                  active
                    ? "border-accent/50 bg-bg-raised text-accent"
                    : "border-border/70 bg-bg-subtle/60 text-fg-muted",
                )}
              >
                <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block text-sm font-bold",
                    active ? "text-fg-strong" : "text-fg-muted",
                  )}
                >
                  {m.label}
                </span>
                <span className="block text-2xs text-fg-faint">{m.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div hidden={mode !== "single"}>
        <ProductionSimulatorShell />
      </div>
      <div hidden={mode !== "range"}>
        <DateRangePlanShell />
      </div>
    </div>
  );
}
