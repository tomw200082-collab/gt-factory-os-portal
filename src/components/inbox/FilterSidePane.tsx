// Filter side-pane for the typed Inbox feed (5 dimensions + saved views).
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.10
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 4.4

"use client";

import { useState, useCallback } from "react";
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
  // Default view: Decision + To-Do + Warning. Info hidden until explicit
  // filter request (per spec §1.10).
  types: ["decision", "to_do", "warning"],
  severities: ["info", "warning", "critical"],
  sources: [],
  status: "open",
  search: "",
});

const HISTORY_FILTER: FilterState = Object.freeze({
  // History tab — closed cards from the last 90 days, all 4 types.
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
      const next = has
        ? state.types.filter((x) => x !== t)
        : [...state.types, t];
      onChange({ ...state, types: next });
    },
    [state, onChange],
  );

  const toggleSeverity = useCallback(
    (s: "info" | "warning" | "critical") => {
      const has = state.severities.includes(s);
      const next = has
        ? state.severities.filter((x) => x !== s)
        : [...state.severities, s];
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

  return (
    <aside className="w-60 shrink-0 border-s border-slate-200 ps-4 space-y-5 text-sm">
      {/* Saved views */}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_FILTER })}
          className="rounded-md bg-slate-100 px-2 py-1 text-start hover:bg-slate-200"
        >
          {FILTER_COPY.savedViewDefault}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...HISTORY_FILTER })}
          className="rounded-md bg-slate-100 px-2 py-1 text-start hover:bg-slate-200"
        >
          {FILTER_COPY.savedViewHistory}
        </button>
      </div>

      {/* Type */}
      <fieldset>
        <legend className="text-xs font-medium text-slate-500 mb-1">
          {FILTER_COPY.type}
        </legend>
        <div className="flex flex-col gap-1">
          {ALL_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={state.types.includes(t)}
                onChange={() => toggleType(t)}
              />
              <span>{copyForCardType(t)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Severity */}
      <fieldset>
        <legend className="text-xs font-medium text-slate-500 mb-1">
          {FILTER_COPY.severity}
        </legend>
        <div className="flex flex-col gap-1">
          {ALL_SEVERITIES.map((s) => (
            <label key={s} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={state.severities.includes(s)}
                onChange={() => toggleSeverity(s)}
              />
              <span>{SEVERITY_LABEL[s]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Status */}
      <fieldset>
        <legend className="text-xs font-medium text-slate-500 mb-1">
          {FILTER_COPY.status}
        </legend>
        <div className="flex flex-col gap-1">
          {(["open", "closed", "all"] as const).map((s) => (
            <label key={s} className="flex items-center gap-2">
              <input
                type="radio"
                name="inbox-status-filter"
                checked={state.status === s}
                onChange={() => setStatus(s)}
              />
              <span>
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

      {/* Search */}
      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">
          {FILTER_COPY.search}
        </label>
        <input
          type="search"
          value={state.search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          placeholder=""
        />
      </div>

      {/* Reset */}
      <div className="flex gap-2 pt-2 border-t border-slate-200">
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_FILTER })}
          className="text-xs text-slate-500 hover:underline"
        >
          {FILTER_COPY.resetFilter}
        </button>
      </div>
    </aside>
  );
}
