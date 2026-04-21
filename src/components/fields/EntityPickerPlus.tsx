"use client";

// ---------------------------------------------------------------------------
// <EntityPickerPlus> — AMMC v1 Slice 3 (crystalline-drifting-dusk §C.1 #2).
//
// Extension of the existing <EntitySearchSelect> primitive. Adds:
//   1. `+ New <entityName>` row at the bottom of the list when `onCreateNew`
//      is provided — clicking the row closes the dropdown and fires the
//      callback, which the caller uses to open a Quick-Create drawer.
//   2. Per-option readiness dot (green/yellow/red) when the caller supplies
//      a `readinessPerOption` map.
//
// Implementation note: rather than touching EntitySearchSelect (the stable
// existing primitive used by multiple live forms), EntityPickerPlus is a
// new self-contained component that re-implements the same shape with
// the additional affordances. Both components share the EntityOption
// shape for compatibility.
// ---------------------------------------------------------------------------

import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { EntityOption } from "./EntitySearchSelect";

export type { EntityOption } from "./EntitySearchSelect";

/** Readiness tone shorthand — lifted from <ReadinessCard> conventions. */
export type ReadinessTone = "green" | "yellow" | "red";

export interface EntityPickerPlusProps {
  /** Controlled value — the option id currently selected. */
  value?: string;
  /** Fired when the user picks or clears an option. */
  onChange: (option: EntityOption | null) => void;
  /** Full option list (client-side filtering). */
  options: EntityOption[];
  /** Trigger-button placeholder when nothing is selected. */
  placeholder?: string;
  /** Flag the input as errored (red border). */
  errored?: boolean;
  /** Disable the whole control. */
  disabled?: boolean;
  /** Empty-state label when filtering returns zero rows. */
  emptyLabel?: string;
  /**
   * If provided, render a `+ New <entityName>` row at list bottom. The row
   * fires this callback on click; the caller should open a Quick-Create
   * drawer and auto-select the new id on return.
   */
  onCreateNew?: () => void;
  /** Label for the create-new row. E.g. "component" → "+ New component". */
  entityName?: string;
  /**
   * Optional map from option id → readiness tone. When present, a coloured
   * dot is rendered next to the option label.
   */
  readinessPerOption?: Record<string, ReadinessTone>;
}

const TONE_DOT: Record<ReadinessTone, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-danger",
};

export function EntityPickerPlus({
  value,
  onChange,
  options,
  placeholder = "Search and pick…",
  errored,
  disabled,
  emptyLabel = "No matches",
  onCreateNew,
  entityName = "entity",
  readinessPerOption,
}: EntityPickerPlusProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 30);
    return options
      .filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.sublabel?.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "input flex items-center justify-between text-left",
          errored && "input-error",
          disabled && "opacity-60",
          open && "border-accent",
        )}
      >
        <span
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2",
            selected ? "text-fg-strong" : "text-fg-faint",
          )}
        >
          {selected ? (
            <>
              {readinessPerOption?.[selected.id] ? (
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    TONE_DOT[readinessPerOption[selected.id]],
                  )}
                  aria-hidden
                  data-testid={`readiness-dot-${selected.id}`}
                />
              ) : null}
              <span className="truncate font-medium">{selected.label}</span>
              {selected.sublabel ? (
                <span className="truncate font-mono text-3xs uppercase tracking-sops text-fg-subtle">
                  {selected.sublabel}
                </span>
              ) : null}
            </>
          ) : (
            <>
              <Search className="h-3.5 w-3.5 text-fg-faint" strokeWidth={2} />
              <span className="truncate">{placeholder}</span>
            </>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-fg-faint transition-transform duration-150",
            open && "rotate-180 text-accent",
          )}
          strokeWidth={2}
        />
      </button>

      {open && !disabled ? (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-md border border-border bg-bg-raised shadow-pop">
          <div className="relative border-b border-border/70 bg-bg-subtle/50">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint"
              strokeWidth={2}
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter"
              className="h-9 w-full bg-transparent pl-9 pr-3 text-sm text-fg-strong placeholder:text-fg-faint focus:outline-none"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-fg-subtle">
                {emptyLabel}
              </li>
            ) : (
              filtered.map((o) => {
                const isSelected = o.id === value;
                const tone = readinessPerOption?.[o.id];
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(o);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={cn(
                        "flex w-full items-start gap-3 px-3 py-2 text-left text-sm transition-colors duration-150",
                        isSelected
                          ? "bg-accent-soft text-accent"
                          : "hover:bg-bg-subtle",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-xs border",
                          isSelected
                            ? "border-accent bg-accent text-accent-fg"
                            : "border-border",
                        )}
                      >
                        {isSelected ? (
                          <Check className="h-3 w-3" strokeWidth={2.5} />
                        ) : null}
                      </span>
                      {tone ? (
                        <span
                          className={cn(
                            "mt-1 h-2 w-2 shrink-0 rounded-full",
                            TONE_DOT[tone],
                          )}
                          aria-hidden
                          data-testid={`readiness-dot-${o.id}`}
                        />
                      ) : null}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium text-fg-strong">
                          {o.label}
                        </span>
                        {o.sublabel ? (
                          <span className="truncate font-mono text-3xs uppercase tracking-sops text-fg-subtle">
                            {o.sublabel}
                          </span>
                        ) : null}
                      </div>
                      {o.hint ? (
                        <span className="shrink-0 text-3xs text-fg-subtle">
                          {o.hint}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
            {onCreateNew ? (
              <li className="border-t border-border/70">
                <button
                  type="button"
                  data-testid="entity-picker-plus-create-new"
                  onClick={() => {
                    setOpen(false);
                    setQuery("");
                    onCreateNew();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-accent transition-colors duration-150 hover:bg-accent-soft"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                  <span>
                    New <span className="lowercase">{entityName}</span>
                  </span>
                </button>
              </li>
            ) : null}
          </ul>
          {selected ? (
            <div className="border-t border-border/70 bg-bg-subtle/40 p-2">
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="btn btn-ghost btn-sm w-full justify-start gap-1.5"
              >
                <X className="h-3 w-3" strokeWidth={2} />
                Clear selection
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
