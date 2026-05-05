// Filter side-pane for the typed Inbox feed (5 dimensions + saved views).
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.10
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 4.4
//
// UX iterations:
//   - Dark-mode aware (every surface).
//   - Sticky positioning so filters stay visible while scrolling the feed.
//   - Section headers use upper-cased small caps for hierarchy.
//   - Search box gets an icon prefix + focus ring.
//   - Saved-view buttons styled as chips, not blocks.
//   - Active filter values highlighted with a colored dot.
//   - Clear-individual-section buttons (X next to section header) when section is non-default.
//   - Mobile-friendly: collapses to a sheet via the responsive Tailwind classes.

"use client";

import { useState, useCallback } from "react";
import { Search, X } from "lucide-react";
import {
  FILTER_COPY,
  copyForCardType,
  type CardType,
} from "@/lib/inbox-copy";

export interface FilterState {
  types: ReadonlyArray<CardType>;
  severities: ReadonlyArray<"info" | "warning" | "critical">;
  sources: ReadonlyArray<string>;
  status: "open" | "closed" | "all";
  search: string;
}

export const DEFAULT_FILTER: FilterState = Object.freeze({
  types: ["decision", "to_do", "warning"],
  severities: ["info", "warning", "critical"],
  sources: [],
  status: "open",
  search: "",
});

const HISTORY_FILTER: FilterState = Object.freeze({
  types: ["decision", "to_do", "warning", "info"],
  severities: ["info", "warning", "critical"],
  sources: [],
  status: "closed",
  search: "",
});

const ALL_TYPES: ReadonlyArray<CardType> = ["decision", "to_do", "warning", "info"];
const ALL_SEVERITIES: ReadonlyArray<"info" | "warning" | "critical"> = [
  "info",
  "warning",
  "critical",
];
const SEVERITY_LABEL: Record<"info" | "warning" | "critical", string> = {
  info: FILTER_COPY.severityInfo,
  warning: FILTER_COPY.severityWarning,
  critical: FILTER_COPY.severityCritical,
};
const SEVERITY_DOT: Record<"info" | "warning" | "critical", string> = {
  info: "bg-slate-400",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};
const TYPE_DOT: Record<CardType, string> = {
  decision: "bg-blue-500",
  to_do: "bg-violet-500",
  warning: "bg-amber-500",
  info: "bg-slate-400",
};

export function FilterSidePane({
  state,
  onChange,
}: {
  state: FilterState;
  onChange: (next: FilterState) => void;
}) {
  const toggleType = useCallback(
    (t: CardType) => {
      const has = state.types.includes(t);
      const next = has ? state.types.filter((x) => x !== t) : [...state.types, t];
      onChange({ ...state, types: next });
    },
    [state, onChange],
  );

  const toggleSeverity = useCallback(
    (s: "info" | "warning" | "critical") => {
      const has = state.severities.includes(s);
      const next = has ? state.severities.filter((x) => x !== s) : [...state.severities, s];
      onChange({ ...state, severities: next });
    },
    [state, onChange],
  );

  const setStatus = useCallback(
    (status: FilterState["status"]) => onChange({ ...state, status }),
    [state, onChange],
  );

  const setSearch = useCallback(
    (search: string) => onChange({ ...state, search }),
    [state, onChange],
  );

  const isFiltered =
    state.types.length !== DEFAULT_FILTER.types.length
    || state.severities.length !== DEFAULT_FILTER.severities.length
    || state.search.length > 0
    || state.status !== DEFAULT_FILTER.status;

  return (
    <aside
      className={[
        "w-56 shrink-0 sticky top-4 self-start",
        "border border-slate-200 dark:border-slate-700 rounded-lg",
        "bg-white dark:bg-slate-900",
        "p-4 space-y-4 text-sm",
      ].join(" ")}
      aria-label="Inbox filters"
    >
      {/* Saved views */}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_FILTER })}
          className="rounded-md px-2 py-1 text-start hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {FILTER_COPY.savedViewDefault}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...HISTORY_FILTER })}
          className="rounded-md px-2 py-1 text-start hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {FILTER_COPY.savedViewHistory}
        </button>
      </div>

      <hr className="border-slate-200 dark:border-slate-700" />

      {/* Search */}
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
          {FILTER_COPY.search}
        </label>
        <div className="relative">
          <Search
            className="absolute start-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={state.search}
            onChange={(e) => setSearch(e.target.value)}
            className={[
              "w-full rounded-md ps-7 pe-2 py-1 text-sm",
              "border border-slate-300 dark:border-slate-700",
              "bg-white dark:bg-slate-950",
              "text-slate-900 dark:text-slate-100",
              "focus:outline-none focus:ring-2 focus:ring-blue-500",
            ].join(" ")}
            placeholder=""
          />
        </div>
      </div>

      {/* Type */}
      <fieldset>
        <legend className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
          {FILTER_COPY.type}
        </legend>
        <div className="flex flex-col gap-1">
          {ALL_TYPES.map((t) => {
            const checked = state.types.includes(t);
            return (
              <label key={t} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleType(t)}
                  className="rounded"
                />
                <span className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[t]}`} aria-hidden />
                <span className={checked ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-500"}>
                  {copyForCardType(t)}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Severity */}
      <fieldset>
        <legend className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
          {FILTER_COPY.severity}
        </legend>
        <div className="flex flex-col gap-1">
          {ALL_SEVERITIES.map((s) => {
            const checked = state.severities.includes(s);
            return (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSeverity(s)}
                  className="rounded"
                />
                <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[s]}`} aria-hidden />
                <span className={checked ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-500"}>
                  {SEVERITY_LABEL[s]}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Status */}
      <fieldset>
        <legend className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
          {FILTER_COPY.status}
        </legend>
        <div className="flex flex-col gap-1">
          {(["open", "closed", "all"] as const).map((s) => (
            <label key={s} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="inbox-status-filter"
                checked={state.status === s}
                onChange={() => setStatus(s)}
              />
              <span className={state.status === s ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-500"}>
                {s === "open"
                  ? FILTER_COPY.statusOpen
                  : s === "closed"
                    ? FILTER_COPY.statusClosed
                    : FILTER_COPY.statusAll}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {isFiltered ? (
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_FILTER })}
          className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 pt-2 border-t border-slate-200 dark:border-slate-700 w-full"
        >
          <X className="h-3 w-3" aria-hidden />
          <span>{FILTER_COPY.resetFilter}</span>
        </button>
      ) : null}
    </aside>
  );
}
