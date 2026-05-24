"use client";

// ---------------------------------------------------------------------------
// ReceiptLandingPicker — Smart entry chooser for the Goods Receipt page.
//
// Tranche 020.
//
// Renders when the operator arrives without a `?po_id=` URL param and has
// not yet committed to a track. Three stacked cards (mobile-first):
//
//   1. Expected today / this week — POs whose expected_receive_date is
//      within the next 7 days. Tap to enter PO track.
//   2. Find a PO — free-text search across po_number, supplier name,
//      and (lazily) item names. Tap a result to enter PO track.
//   3. Receive without PO — primary CTA into manual track.
//
// All data fetching happens in the parent (page.tsx); this component is
// presentation + selection only. Inputs are pre-shaped via types.ts.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  type PoOption,
  type SupplierOption,
  PO_STATUS_BADGE,
  expectedBucketLabel,
  daysFromToday,
} from "./types";

interface ReceiptLandingPickerProps {
  openPos: PoOption[];
  suppliers: SupplierOption[];
  onSelectPo: (po: PoOption) => void;
  onStartManual: () => void;
  isLoadingPos: boolean;
}

export function ReceiptLandingPicker({
  openPos,
  suppliers,
  onSelectPo,
  onStartManual,
  isLoadingPos,
}: ReceiptLandingPickerProps) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Map supplier_id → name so the cards can show real names instead of UUIDs.
  const supplierName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliers) m.set(s.supplier_id, s.supplier_name_official);
    return m;
  }, [suppliers]);

  // Bucket 1: expected today/this week (≤7 days from today OR overdue).
  // Sort: overdue first, then today, then nearest future date.
  const expectedSoon = useMemo(() => {
    return openPos
      .filter((p) => {
        const d = daysFromToday(p.expected_receive_date);
        return d !== null && d <= 7;
      })
      .sort((a, b) => {
        const da = daysFromToday(a.expected_receive_date) ?? 999;
        const db = daysFromToday(b.expected_receive_date) ?? 999;
        return da - db;
      });
  }, [openPos]);

  // Bucket 2: search results.
  // Matches po_number, supplier name, or supplier_id.
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return openPos
      .filter((p) => {
        const name = supplierName.get(p.supplier_id) ?? p.supplier_id;
        return (
          p.po_number.toLowerCase().includes(q) ||
          name.toLowerCase().includes(q) ||
          p.supplier_id.toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [openPos, query, supplierName]);

  const hasNoOpenPos = !isLoadingPos && openPos.length === 0;

  return (
    <section
      className="mb-4 space-y-3"
      data-testid="receipt-landing-picker"
      aria-label="Choose how to start the receipt"
    >
      {/* Header */}
      <div className="px-1">
        <h2 className="text-base font-semibold tracking-tightish text-fg-strong">
          What&apos;s arriving?
        </h2>
        <p className="mt-0.5 text-xs text-fg-muted">
          Pick how to start your receipt. You can switch later.
        </p>
      </div>

      {/* Card 1 — Expected today / this week */}
      <div
        className={cn(
          "card overflow-hidden",
          expectedSoon.length > 0 && "border-info/40",
        )}
        data-testid="receipt-landing-expected"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-gradient-to-b from-bg-raised to-bg/40 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden="true">🚚</span>
              <h3 className="text-sm font-semibold text-fg-strong">
                Expected today &amp; this week
              </h3>
              <span className="inline-flex items-center rounded-full bg-bg-subtle px-2 py-0.5 text-3xs font-medium text-fg-muted">
                {isLoadingPos ? "…" : expectedSoon.length}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-fg-muted">
              Open POs scheduled within the next 7 days.
            </p>
          </div>
        </div>
        <div className="p-2 sm:p-3">
          {isLoadingPos ? (
            <div className="space-y-2" aria-busy="true">
              <div className="h-12 w-full animate-pulse rounded bg-bg-subtle" />
              <div
                className="h-12 w-full animate-pulse rounded bg-bg-subtle"
                style={{ animationDelay: "120ms" }}
              />
            </div>
          ) : expectedSoon.length === 0 ? (
            <div className="rounded border border-dashed border-border/60 px-3 py-4 text-center text-xs text-fg-muted">
              {hasNoOpenPos
                ? "No open POs. Use a manual receipt below."
                : "Nothing expected in the next 7 days. Try search or manual entry below."}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {(showAll ? expectedSoon : expectedSoon.slice(0, 5)).map((po) => {
                const bucket = expectedBucketLabel(po.expected_receive_date);
                const sName = supplierName.get(po.supplier_id) ?? po.supplier_id;
                return (
                  <li key={po.po_id}>
                    <button
                      type="button"
                      className={cn(
                        "group w-full rounded-md border border-border/60 bg-bg-raised px-3 py-2.5 text-left transition-colors duration-150",
                        "hover:border-accent/50 hover:bg-accent-soft/30",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        // Overdue gets a strong left-rail and red accent on
                        // hover so it can't be missed in a long list.
                        bucket.overdue &&
                          "border-l-4 border-l-danger pl-2.5 hover:border-l-danger hover:border-danger/50",
                      )}
                      onClick={() => onSelectPo(po)}
                      data-testid={`receipt-landing-expected-row-${po.po_id}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Lead with supplier name — operators recognize the
                            truck by who's driving it, not by PO number. */}
                        <span className="truncate text-sm font-semibold text-fg-strong">
                          {sName}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-3xs font-semibold uppercase",
                            PO_STATUS_BADGE[po.status] ??
                              "bg-bg-subtle text-fg-muted",
                          )}
                        >
                          {po.status}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-3xs font-medium",
                            bucket.overdue
                              ? "bg-danger-softer text-danger-fg"
                              : bucket.tier === "now"
                                ? "bg-warning-softer text-warning-fg"
                                : bucket.tier === "soon"
                                  ? "bg-info-softer text-info-fg"
                                  : "bg-bg-subtle text-fg-muted",
                          )}
                        >
                          {bucket.longLabel}
                        </span>
                        <span className="ml-auto text-3xs text-fg-subtle transition-colors group-hover:text-accent">
                          Receive →
                        </span>
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-fg-muted">
                        {po.po_number}
                      </div>
                    </button>
                  </li>
                );
              })}
              {expectedSoon.length > 5 && (
                <li>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm w-full"
                    onClick={() => setShowAll((v) => !v)}
                    data-testid="receipt-landing-expected-toggle"
                  >
                    {showAll
                      ? `Show top 5`
                      : `Show all ${expectedSoon.length} →`}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Card 2 — Find a PO */}
      <div className="card overflow-hidden" data-testid="receipt-landing-search">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-gradient-to-b from-bg-raised to-bg/40 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden="true">🔍</span>
              <h3 className="text-sm font-semibold text-fg-strong">Find a PO</h3>
              {/* Live match count — only when searching. */}
              {query.trim() && !isLoadingPos ? (
                <span className="inline-flex items-center rounded-full bg-bg-subtle px-2 py-0.5 text-3xs font-medium text-fg-muted">
                  {searchResults.length} match
                  {searchResults.length !== 1 ? "es" : ""}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-fg-muted">
              Search by PO number or supplier name.
            </p>
          </div>
          {/* Keyboard hint — visually subtle but useful for power users. */}
          <span className="hidden items-center gap-1 text-3xs text-fg-subtle sm:flex">
            <kbd className="rounded border border-border/70 bg-bg-raised px-1.5 py-0.5 font-mono">
              ↵
            </kbd>
            <span>top match</span>
          </span>
        </div>
        <div className="p-3 sm:p-4">
          <input
            type="search"
            className="input w-full transition-colors duration-150"
            placeholder="e.g. PO-0042  or  Acme Foods"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Press Enter to commit to the top match — saves a click on
              // desktop and avoids fat-fingering on mobile.
              if (e.key === "Enter" && searchResults.length > 0) {
                e.preventDefault();
                onSelectPo(searchResults[0]);
              }
            }}
            aria-label="Search open purchase orders"
            data-testid="receipt-landing-search-input"
            disabled={isLoadingPos}
            autoComplete="off"
          />
          {query.trim() ? (
            <ul className="mt-2 space-y-1.5">
              {searchResults.length === 0 ? (
                <li className="rounded border border-dashed border-border/60 px-3 py-4 text-center text-xs">
                  <div className="text-fg-muted">
                    No matching open POs for{" "}
                    <span className="font-medium text-fg">
                      &ldquo;{query.trim()}&rdquo;
                    </span>
                    .
                  </div>
                  {!hasNoOpenPos ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm mt-2"
                      onClick={() => setQuery("")}
                      data-testid="receipt-landing-search-clear"
                    >
                      Clear search →
                    </button>
                  ) : null}
                </li>
              ) : (
                searchResults.map((po, i) => {
                  const bucket = expectedBucketLabel(po.expected_receive_date);
                  const sName =
                    supplierName.get(po.supplier_id) ?? po.supplier_id;
                  const isTopMatch = i === 0;
                  return (
                    <li key={po.po_id}>
                      <button
                        type="button"
                        className={cn(
                          "group w-full rounded-md border border-border/60 bg-bg-raised px-3 py-2.5 text-left transition-colors duration-150",
                          "hover:border-accent/50 hover:bg-accent-soft/30",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                          // Subtle highlight on the top match so the
                          // Enter-to-select binding has a visible target.
                          isTopMatch && "border-accent/30",
                          bucket.overdue &&
                            "border-l-4 border-l-danger pl-2.5",
                        )}
                        onClick={() => onSelectPo(po)}
                        data-testid={`receipt-landing-search-row-${po.po_id}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-fg-strong">
                            {sName}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-3xs font-semibold uppercase",
                              PO_STATUS_BADGE[po.status] ??
                                "bg-bg-subtle text-fg-muted",
                            )}
                          >
                            {po.status}
                          </span>
                          {po.expected_receive_date ? (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-3xs font-medium",
                                bucket.overdue
                                  ? "bg-danger-softer text-danger-fg"
                                  : "text-fg-muted",
                              )}
                            >
                              {bucket.longLabel}
                            </span>
                          ) : null}
                          {isTopMatch ? (
                            <span className="hidden items-center gap-1 text-3xs text-accent sm:flex">
                              <kbd className="rounded border border-accent/30 bg-accent-soft px-1 py-0.5 font-mono">
                                ↵
                              </kbd>
                            </span>
                          ) : null}
                          <span className="ml-auto text-3xs text-fg-subtle transition-colors group-hover:text-accent">
                            Receive →
                          </span>
                        </div>
                        <div className="mt-1 truncate font-mono text-xs text-fg-muted">
                          {po.po_number}
                        </div>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          ) : null}
        </div>
      </div>

      {/* Card 3 — Manual receipt */}
      <div
        className="card overflow-hidden"
        data-testid="receipt-landing-manual"
      >
        <div className="border-b border-border/70 bg-gradient-to-b from-bg-raised to-bg/40 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">➕</span>
            <h3 className="text-sm font-semibold text-fg-strong">
              Receive without a PO
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-fg-muted">
            Unannounced delivery, walk-in stock, or returns. You can still
            link a PO line after you pick the item.
          </p>
        </div>
        <div className="p-3 sm:p-4">
          <button
            type="button"
            className="btn btn-primary w-full transition-colors duration-150"
            onClick={onStartManual}
            data-testid="receipt-landing-manual-start"
          >
            Start a manual receipt →
          </button>
        </div>
      </div>
    </section>
  );
}
