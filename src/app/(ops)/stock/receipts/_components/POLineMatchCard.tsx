"use client";

// ---------------------------------------------------------------------------
// POLineMatchCard — per-receipt-line PO match UI.
//
// Tranche 020.
//
// Replaces the inline native <select> that previously did the per-line
// matching with a friendlier surface:
//
//   - PO track:
//       * If unmatched: a "Match to PO line" combobox/list — friendlier
//         than the native select; shows line #, item, and ordered/open qty.
//       * If matched: four progress pills
//         [Ordered N · Received before R · Receiving now Q · Remaining L]
//         + a proportional progress bar.
//         If Q > L (over-receipt), the Remaining pill flips red and an
//         exception strip appears (allowed, but loudly logged).
//
//   - Manual track:
//       * If a `suggestion` is provided, render a yellow "💡 Open on PO
//         …" pill with a "Link →" button. The parent owns the actual
//         linking (it may need to switch the whole receipt's track).
//
// The component is intentionally stateless w.r.t. the form data; the
// parent passes `onChangeMatch` to react to picker changes.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { PoLineOption } from "./types";

export interface POLineMatchSuggestion {
  // Identity of the suggested match.
  po_id: string;
  po_number: string;
  po_line_id: string;
  line_number: number;
  // Snapshot of what the operator should see in the pill.
  open_qty: string;
  uom: string;
  supplier_name: string;
}

interface POLineMatchCardProps {
  // PO-track inputs (poLines empty → behaves like manual track).
  poLines: PoLineOption[];
  selectedPoLineId: string;
  receivingQty: string; // current draft quantity (string from input)
  // Track mode — controls which surface to show.
  mode: "po" | "manual";
  // PO-track callback (operator picked / cleared a PO line match).
  onChangeMatch: (poLineId: string, autoFillQty?: string, autoFillUom?: string) => void;
  // Manual-track inputs — optional suggestion derived by the parent from
  // the current item pick + open PO lines + supplier.
  suggestion?: POLineMatchSuggestion | null;
  onAcceptSuggestion?: (s: POLineMatchSuggestion) => void;
  onDismissSuggestion?: () => void;
  disabled?: boolean;
  // Used for stable data-testids on a per-line basis.
  testIdPrefix: string;
}

export function POLineMatchCard({
  poLines,
  selectedPoLineId,
  receivingQty,
  mode,
  onChangeMatch,
  suggestion,
  onAcceptSuggestion,
  onDismissSuggestion,
  disabled,
  testIdPrefix,
}: POLineMatchCardProps) {
  // -----------------------------------------------------------------------
  // Manual track surface: just the optional suggestion pill.
  // -----------------------------------------------------------------------
  if (mode === "manual") {
    if (!suggestion) return null;
    return (
      <div
        className="col-span-full flex flex-wrap items-center gap-2 rounded-md border border-info/40 bg-info-softer px-3 py-2 text-xs text-info-fg"
        role="status"
        data-testid={`${testIdPrefix}-suggestion`}
      >
        <span aria-hidden="true">💡</span>
        <span>
          Open on{" "}
          <span className="font-mono font-semibold">
            {suggestion.po_number}
          </span>{" "}
          ({suggestion.supplier_name}) — line #{suggestion.line_number},{" "}
          <span className="font-semibold">
            {suggestion.open_qty} {suggestion.uom}
          </span>{" "}
          outstanding.
        </span>
        <div className="ml-auto flex items-center gap-1">
          {onAcceptSuggestion ? (
            <button
              type="button"
              className="btn btn-sm btn-primary transition-colors duration-150"
              onClick={() => onAcceptSuggestion(suggestion)}
              disabled={disabled}
              data-testid={`${testIdPrefix}-suggestion-accept`}
            >
              Link →
            </button>
          ) : null}
          {onDismissSuggestion ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm transition-colors duration-150"
              onClick={onDismissSuggestion}
              disabled={disabled}
              aria-label="Dismiss suggestion"
              data-testid={`${testIdPrefix}-suggestion-dismiss`}
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // PO track surface.
  // -----------------------------------------------------------------------
  // Sort PO lines: OPEN/PARTIAL first (most-receivable on top), then CLOSED,
  // then CANCELLED. Within a group, by line_number.
  const orderedLines = useMemo(() => {
    const rank: Record<string, number> = {
      OPEN: 0,
      PARTIAL: 0,
      CLOSED: 1,
      CANCELLED: 2,
    };
    return [...poLines].sort((a, b) => {
      const ra = rank[a.line_status] ?? 3;
      const rb = rank[b.line_status] ?? 3;
      if (ra !== rb) return ra - rb;
      return a.line_number - b.line_number;
    });
  }, [poLines]);

  const selected = useMemo(
    () => poLines.find((l) => l.po_line_id === selectedPoLineId) ?? null,
    [poLines, selectedPoLineId],
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  // Keyboard navigation within the picker list.
  const [highlightIdx, setHighlightIdx] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Auto-expand the picker the first time it has matching candidates
  // and the operator hasn't picked one yet. Saves a click on the most
  // common path: PO chosen from landing → form opens → operator
  // immediately sees the line options.
  const autoExpandedRef = useRef(false);
  useEffect(() => {
    if (autoExpandedRef.current) return;
    if (selectedPoLineId) return; // already matched
    if (poLines.length === 0) return;
    if (disabled) return;
    autoExpandedRef.current = true;
    setPickerOpen(true);
  }, [selectedPoLineId, poLines, disabled]);

  // Focus the list when it opens so keyboard nav works without a click.
  useEffect(() => {
    if (pickerOpen) {
      // Start highlight on the first real option (index 1), not the
      // "unmatched" pseudo-row, so ↵ picks the most useful default.
      setHighlightIdx(1);
      // Defer focus until after paint so the listbox is mounted.
      const id = requestAnimationFrame(() => listRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [pickerOpen]);

  // Scroll the highlighted option into view as the operator arrow-keys.
  useEffect(() => {
    if (!pickerOpen || !listRef.current) return;
    const el = listRef.current.children[highlightIdx] as
      | HTMLLIElement
      | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, pickerOpen]);

  // Numbers for the progress pills.
  const ordered = selected ? Number(selected.ordered_qty) || 0 : 0;
  const receivedBefore = selected ? Number(selected.received_qty) || 0 : 0;
  const receivingNow = Number(receivingQty) || 0;
  const remainingBefore = selected ? Number(selected.open_qty) || 0 : 0;
  const remainingAfter = remainingBefore - receivingNow;
  const isOver = selected !== null && remainingAfter < 0;
  // Severity tier for over-receipt: minor (≤50% over) vs major (>50%).
  // Both submit successfully; major just warns more loudly.
  const overPctOfOrdered =
    isOver && ordered > 0 ? (Math.abs(remainingAfter) / ordered) * 100 : 0;
  const isMajorOver = isOver && overPctOfOrdered > 50;

  // Two-band progress: dark band = received-before, light band = receiving-now.
  const totalAfter = receivedBefore + receivingNow;
  const beforePct =
    ordered > 0 ? Math.min(100, (receivedBefore / ordered) * 100) : 0;
  const nowPct =
    ordered > 0
      ? Math.min(100 - beforePct, (receivingNow / ordered) * 100)
      : 0;
  const overPct =
    isOver && ordered > 0
      ? Math.min(100, ((totalAfter - ordered) / ordered) * 100)
      : 0;

  if (poLines.length === 0) {
    // Parent passed PO mode but no lines — render nothing here; parent
    // shows its own "Selected PO returned no lines" message.
    return null;
  }

  return (
    <div
      className={cn(
        "col-span-full space-y-2 rounded-md border px-3 py-2.5",
        // Stronger left rail signals match state at a glance: red for
        // over-receipt, accent for matched, neutral for unmatched.
        isOver
          ? "border-danger/40 border-l-4 border-l-danger bg-danger-softer pl-2.5"
          : selected
            ? "border-accent/30 border-l-4 border-l-accent bg-accent-soft/30 pl-2.5"
            : "border-border/60 bg-bg-subtle/30",
      )}
      data-testid={`${testIdPrefix}-match-card`}
    >
      {/* Header row: label + chip + change link */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-fg">PO line match</span>
        {selected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-raised px-2 py-0.5 text-3xs font-medium text-fg">
            <span className="font-mono">#{selected.line_number}</span>
            <span className="text-fg-muted">·</span>
            <span className="truncate max-w-[160px]">
              {selected.component_name ??
                selected.item_name ??
                selected.component_id ??
                selected.item_id ??
                "—"}
            </span>
          </span>
        ) : (
          <span className="text-fg-muted">— unmatched —</span>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm ml-auto transition-colors duration-150"
          onClick={() => setPickerOpen((v) => !v)}
          disabled={disabled}
          data-testid={`${testIdPrefix}-match-toggle`}
          aria-expanded={pickerOpen}
        >
          {selected ? "Change" : "Pick line"}
        </button>
      </div>

      {/* Inline picker — expanded list of PO lines, friendlier than <select>.
          Keyboard nav: ↑↓ move highlight, Enter selects, Esc closes. */}
      {pickerOpen ? (
        <ul
          ref={listRef}
          className="max-h-60 space-y-1 overflow-y-auto rounded border border-border/60 bg-bg-raised p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          role="listbox"
          tabIndex={0}
          data-testid={`${testIdPrefix}-match-list`}
          aria-activedescendant={
            orderedLines[highlightIdx]
              ? `${testIdPrefix}-match-opt-${orderedLines[highlightIdx].po_line_id}`
              : undefined
          }
          onKeyDown={(e) => {
            // -1 reserved for "unmatched" pseudo-row at index 0.
            const total = orderedLines.length + 1; // +1 for unmatched
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlightIdx((i) => Math.min(i + 1, total - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlightIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (highlightIdx === 0) {
                onChangeMatch("");
              } else {
                const pl = orderedLines[highlightIdx - 1];
                if (!pl) return;
                const open = Number(pl.open_qty) || 0;
                onChangeMatch(
                  pl.po_line_id,
                  open > 0 ? pl.open_qty : undefined,
                  pl.uom,
                );
              }
              setPickerOpen(false);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setPickerOpen(false);
            }
          }}
        >
          <li
            id={`${testIdPrefix}-match-opt-unmatched`}
            role="option"
            aria-selected={!selectedPoLineId}
          >
            <button
              type="button"
              className={cn(
                "w-full rounded px-2 py-1.5 text-left text-xs transition-colors",
                !selectedPoLineId && "bg-bg-subtle font-semibold text-fg",
                highlightIdx === 0 &&
                  "ring-1 ring-accent ring-offset-1 ring-offset-bg-raised",
                "hover:bg-bg-subtle",
              )}
              onClick={() => {
                onChangeMatch("");
                setPickerOpen(false);
              }}
              onMouseEnter={() => setHighlightIdx(0)}
              data-testid={`${testIdPrefix}-match-pick-unmatched`}
            >
              — unmatched —
            </button>
          </li>
          {orderedLines.map((pl, i) => {
            const name =
              pl.component_name ??
              pl.item_name ??
              pl.component_id ??
              pl.item_id ??
              "—";
            const closed =
              pl.line_status === "CLOSED" || pl.line_status === "CANCELLED";
            const open = Number(pl.open_qty) || 0;
            const isHighlighted = highlightIdx === i + 1;
            const isSelected = pl.po_line_id === selectedPoLineId;
            return (
              <li
                key={pl.po_line_id}
                id={`${testIdPrefix}-match-opt-${pl.po_line_id}`}
                role="option"
                aria-selected={isSelected}
              >
                <button
                  type="button"
                  className={cn(
                    "group w-full rounded px-2 py-1.5 text-left text-xs transition-colors",
                    isSelected
                      ? "bg-accent-soft font-semibold text-accent"
                      : closed
                        ? "text-fg-muted hover:bg-bg-subtle"
                        : "hover:bg-bg-subtle",
                    isHighlighted &&
                      !isSelected &&
                      "ring-1 ring-accent ring-offset-1 ring-offset-bg-raised",
                  )}
                  onClick={() => {
                    const autoQty = open > 0 ? pl.open_qty : undefined;
                    onChangeMatch(pl.po_line_id, autoQty, pl.uom);
                    setPickerOpen(false);
                  }}
                  onMouseEnter={() => setHighlightIdx(i + 1)}
                  data-testid={`${testIdPrefix}-match-pick-${pl.po_line_id}`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "font-mono text-3xs",
                        isSelected ? "text-accent" : "text-fg-muted",
                      )}
                    >
                      #{pl.line_number}
                    </span>
                    <span className="truncate">{name}</span>
                    <span
                      className={cn(
                        "ml-auto rounded-full px-1.5 py-0.5 text-3xs font-medium",
                        closed
                          ? "bg-bg-subtle text-fg-muted"
                          : open === 0
                            ? "bg-warning-softer text-warning-fg"
                            : "bg-success-softer text-success-fg",
                      )}
                    >
                      {closed
                        ? pl.line_status
                        : `${pl.open_qty} / ${pl.ordered_qty} ${pl.uom}`}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Progress pills + bar — only when matched */}
      {selected ? (
        <>
          <div
            className="flex flex-wrap items-center gap-1.5 text-3xs"
            data-testid={`${testIdPrefix}-match-pills`}
          >
            <Pill
              label="Ordered"
              value={`${selected.ordered_qty} ${selected.uom}`}
              tone="neutral"
            />
            <Pill
              label="Received"
              value={selected.received_qty}
              tone={receivedBefore > 0 ? "info" : "neutral"}
            />
            <Pill
              label="Now"
              value={receivingNow > 0 ? `+${receivingQty || 0}` : "—"}
              tone={receivingNow > 0 ? "accent" : "neutral"}
            />
            <Pill
              label={isOver ? "Over by" : "Left"}
              value={
                isOver
                  ? `${Math.abs(remainingAfter)} ${selected.uom}`
                  : `${remainingAfter} ${selected.uom}`
              }
              tone={
                isOver
                  ? "danger"
                  : remainingAfter === 0
                    ? "success"
                    : "warning"
              }
            />
          </div>

          {/* Quick-fill: receive the full remaining qty in one tap. Most
              common path on a same-day, single-shipment line. Only shows
              when the operator hasn't yet entered a quantity and there's
              something to receive — avoids cluttering the partial path. */}
          {!isOver && receivingNow === 0 && remainingBefore > 0 ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm self-start text-3xs transition-colors duration-150"
              onClick={() =>
                onChangeMatch(
                  selected.po_line_id,
                  String(remainingBefore),
                  selected.uom,
                )
              }
              data-testid={`${testIdPrefix}-receive-remaining`}
            >
              ⇥ Receive remaining ({remainingBefore} {selected.uom})
            </button>
          ) : null}

          {/* Stacked progress bar: received-before band + receiving-now band + over-receipt overlay */}
          <div
            className="relative h-2 w-full overflow-hidden rounded-full bg-bg-subtle"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={Number(selected.ordered_qty) || 0}
            aria-valuenow={totalAfter}
            aria-label="Receipt progress against ordered quantity"
          >
            <div
              className="absolute inset-y-0 left-0 bg-info"
              style={{ width: `${beforePct}%` }}
            />
            <div
              className="absolute inset-y-0 bg-accent transition-all duration-200"
              style={{
                left: `${beforePct}%`,
                width: `${nowPct}%`,
              }}
            />
            {isOver ? (
              <div
                className="absolute inset-y-0 right-0 animate-pulse bg-danger"
                style={{ width: `${overPct}%` }}
              />
            ) : null}
          </div>

          {/* Over-receipt callout. Two severity tiers:
              - Minor (≤50% over): standard warning, post-allowed.
              - Major (>50% over):  same allow-policy, but louder copy
                                    nudging the operator to double-check
                                    the quantity before submitting. */}
          {isOver ? (
            <div
              className={cn(
                "flex items-start gap-2 rounded px-2 py-1.5 text-xs",
                isMajorOver
                  ? "border-l-4 border-danger bg-danger-softer text-danger-fg"
                  : "border-l-2 border-danger bg-danger-softer/80 text-danger-fg",
              )}
              role="alert"
              data-testid={`${testIdPrefix}-over-receipt`}
              data-over-severity={isMajorOver ? "major" : "minor"}
            >
              <svg
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <div className="font-semibold">
                  {isMajorOver
                    ? `⚠ Over-receipt by ${Math.abs(remainingAfter)} ${selected.uom} — ${Math.round(overPctOfOrdered)}% over ordered`
                    : `Over-receipt by ${Math.abs(remainingAfter)} ${selected.uom}`}
                </div>
                <div className="opacity-90">
                  {isMajorOver
                    ? `That's significantly more than ordered (${selected.ordered_qty} ${selected.uom}). Double-check the quantity before submitting — this will still post, but a large over-receipt is unusual and gets flagged for review.`
                    : `This line was ${receivedBefore > 0 ? "partially " : ""}fulfilled — receiving more than ordered. Logged as an exception on submit; ledger still posts.`}
                </div>
              </div>
            </div>
          ) : null}

          {/* Closed-line callout (line_status CLOSED before this receipt) */}
          {selected.line_status === "CLOSED" && !isOver ? (
            <div
              className="text-3xs text-warning-fg"
              data-testid={`${testIdPrefix}-closed-line`}
            >
              This PO line was already closed. Receiving more will post as
              an over-receipt.
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// Small inline pill primitive. Kept local — the chip system in
// globals.css is fine but doesn't compose four-pills-in-a-row with a
// label/value pair cleanly.
function Pill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "info" | "accent" | "warning" | "success" | "danger";
}) {
  const toneClasses: Record<typeof tone, string> = {
    neutral: "bg-bg-raised text-fg-muted border-border/60",
    info: "bg-info-softer text-info-fg border-info/30",
    accent: "bg-accent-soft text-accent border-accent/30",
    warning: "bg-warning-softer text-warning-fg border-warning/30",
    success: "bg-success-softer text-success-fg border-success/30",
    danger: "bg-danger-softer text-danger-fg border-danger/40",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        toneClasses[tone],
      )}
    >
      <span className="font-medium uppercase tracking-wide opacity-70">
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}
