"use client";

// ---------------------------------------------------------------------------
// FilterBar — primary segmented control + family chips + refined search.
//
// Top-region polish (2026-05-05). Senior UX/UI pass:
//   - "All items / At risk only" promoted to FIRST primary segmented control
//     (Tom: "this is my primary filter")
//   - Family chips show inline at-risk counts e.g. CALM (4)
//   - Search input gains ⌘K / Ctrl+K keyboard hint + global shortcut
//   - Bar sticks to the top of the scroll container under the hero
//
// Design refs (research consulted 2026-05-05):
//   - Linear "How we redesigned the Linear UI" — simplified header,
//     filters grouped beside primary action.
//   - Refactoring UI — primary actions get clear weight; secondary filters
//     read as pill buttons; reduce visual noise on inactive states.
//   - Apple HIG / Primer / Mobbin — segmented controls best with 2-5 text
//     labels for mutually exclusive view changes (perfect fit for All vs
//     At-risk).
//
// State is URL-backed via ?at_risk_only=, ?family=, ?q= so users can
// share / bookmark a filtered view. Default `at_risk_only=true`.
// ---------------------------------------------------------------------------

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { GroupFilterBar } from "@/components/filters/GroupFilterBar";
import type { GroupLike } from "@/lib/taxonomy/groups";
import type { FlowItem } from "../_lib/types";
import { isAtRisk } from "../_lib/risk";

interface FilterBarProps {
  families: string[];
  /** All FG items in the current projection (unfiltered) — used to compute
   *  per-family at-risk counts shown inline on each family chip. */
  items?: FlowItem[];
  /** Groups v1 (Tranche 044) — curated product groups rendered as a
   *  single-select chip row backed by the ?product_group= URL param.
   *  Plain chips (no counts): FlowItem rows do not carry product_group_key,
   *  so per-group at-risk counts are not cheap to compute client-side. */
  productGroups?: readonly GroupLike[];
  /** Optional sticky-mode toggle. When true, the bar pins below the hero
   *  with a backdrop-blur. Default: true. Set false in narrow contexts. */
  sticky?: boolean;
}

export function FilterBar({
  families,
  items,
  productGroups,
  sticky = true,
}: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const family = searchParams.get("family") ?? "";
  const productGroup = searchParams.get("product_group") ?? "";
  // default ON (at-risk-only) unless explicitly false
  const atRiskOnly = searchParams.get("at_risk_only") !== "false";

  const updateParam = useCallback(
    (k: string, v: string | null) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (v == null || v === "") sp.delete(k);
      else sp.set(k, v);
      const qs = sp.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  // ⌘K / Ctrl+K global focus shortcut for the search input.
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Mac ⌘K or Win/Linux Ctrl+K
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Detect platform for the kbd hint copy. Defensive — SSR hydration safe:
  // start as null, assign on mount.
  const [isMac, setIsMac] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform));
  }, []);

  // At-risk count per family — computed once over all items.
  const familyCounts = useMemo(() => {
    if (!items?.length) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const it of items) {
      if (!it.family) continue;
      if (!isAtRisk(it.risk_tier)) continue;
      counts.set(it.family, (counts.get(it.family) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const totalAtRisk = useMemo(() => {
    if (!items?.length) return 0;
    return items.filter((it) => isAtRisk(it.risk_tier)).length;
  }, [items]);

  // Sticky-state observation: flip `data-stuck="true"` when the bar hits
  // the top of its scroll context, so the hairline border + lifted blur
  // render only when actually stuck (less visual noise at rest).
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sticky) return;
    const sentinel = sentinelRef.current;
    const target = stickyRef.current;
    if (!sentinel || !target) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          target.dataset.stuck = entry.isIntersecting ? "false" : "true";
        }
      },
      { threshold: [0], rootMargin: "0px" },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [sticky]);

  return (
    <>
      {sticky ? <div ref={sentinelRef} aria-hidden className="h-0 w-0" /> : null}
      <div
        ref={stickyRef}
        className={cn(
          "flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center",
          sticky && "filter-bar-sticky",
        )}
        data-stuck="false"
      >
        {/* PRIMARY: At-risk segmented control — first in the row. */}
        <div
          className="segmented shrink-0"
          role="tablist"
          aria-label="Risk filter"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!atRiskOnly}
            onClick={() => updateParam("at_risk_only", "false")}
            className="segmented-option uppercase tracking-sops"
            data-active={!atRiskOnly}
          >
            All items
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={atRiskOnly}
            onClick={() => updateParam("at_risk_only", null)}
            className="segmented-option uppercase tracking-sops"
            data-active={atRiskOnly}
            data-tone="danger"
          >
            <span>At risk only</span>
            {totalAtRisk > 0 ? (
              <span
                className={cn(
                  "tabular-nums normal-case font-semibold",
                  atRiskOnly ? "text-danger-fg" : "text-fg-muted",
                )}
              >
                {totalAtRisk}
              </span>
            ) : null}
          </button>
        </div>

        {/* Search — refined: bg-subtle, no shadow, ⌘K hint + global shortcut */}
        <label className="relative block w-full lg:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint"
            strokeWidth={2}
            aria-hidden
          />
          <input
            ref={searchRef}
            type="search"
            value={q}
            onChange={(e) => updateParam("q", e.target.value)}
            placeholder="Search items"
            aria-label="Search items"
            className="w-full rounded-sm border border-border bg-bg-subtle py-1.5 pl-8 pr-16 text-xs text-fg placeholder:text-fg-faint focus:border-accent-border focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          {q ? (
            <button
              type="button"
              onClick={() => {
                updateParam("q", null);
                searchRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-fg-faint hover:bg-bg-muted hover:text-fg"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          ) : (
            <span
              aria-hidden
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
              title="Press to focus search"
            >
              <span className="kbd-hint">
                {isMac == null ? "⌘K" : isMac ? "⌘K" : "Ctrl K"}
              </span>
            </span>
          )}
        </label>

        {/* Family chips with at-risk counts */}
        {families.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <ChipButton
              active={family === ""}
              onClick={() => updateParam("family", null)}
              label="All families"
            />
            {families.map((f) => {
              const count = familyCounts.get(f) ?? 0;
              return (
                <ChipButton
                  key={f}
                  active={family === f}
                  onClick={() => updateParam("family", family === f ? null : f)}
                  label={f}
                  count={count > 0 ? count : undefined}
                />
              );
            })}
          </div>
        ) : null}

        {/* Groups v1 — curated product-group chips (single-select, URL-backed
            via ?product_group=, refetches the projection server-side). */}
        {productGroups && productGroups.length > 0 ? (
          <GroupFilterBar
            groups={productGroups}
            selected={productGroup ? [productGroup] : []}
            onToggle={(key) =>
              updateParam("product_group", productGroup === key ? null : key)
            }
            onClear={() => updateParam("product_group", null)}
            label="קו מוצר"
            ariaLabel="Product group filter"
            testId="flow-product-group-filter"
            className="basis-full"
          />
        ) : null}
      </div>
    </>
  );
}

interface ChipButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}

function ChipButton({ active, onClick, label, count }: ChipButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[10px] font-medium uppercase tracking-sops transition-all duration-150",
        active
          ? "border-accent-border bg-accent-soft text-accent shadow-sm"
          : "border-border bg-bg-subtle text-fg-muted hover:-translate-y-px hover:border-accent/40 hover:text-fg hover:shadow-sm",
      )}
    >
      <span>{label}</span>
      {count != null ? (
        <span
          className={cn(
            "tabular-nums normal-case font-semibold",
            active ? "text-accent" : "text-danger-fg",
          )}
          aria-label={`${count} at risk`}
        >
          ({count})
        </span>
      ) : null}
    </button>
  );
}
