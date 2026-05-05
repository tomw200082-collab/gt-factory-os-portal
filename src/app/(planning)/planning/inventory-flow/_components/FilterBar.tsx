"use client";

// ---------------------------------------------------------------------------
// FilterBar — search input + family chips + at-risk toggle.
//
// State is URL-backed via ?at_risk_only=, ?family=, ?q= so users can
// share / bookmark a filtered view. The default is `at_risk_only=true`
// (operators want the morning view of "what needs attention").
// ---------------------------------------------------------------------------

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

interface FilterBarProps {
  families: string[];
}

export function FilterBar({ families }: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const family = searchParams.get("family") ?? "";
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

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      {/* Search — refined: bg-subtle, no shadow, accent border on focus */}
      <label className="relative block w-full lg:max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint"
          strokeWidth={2}
        />
        <input
          type="search"
          value={q}
          onChange={(e) => updateParam("q", e.target.value)}
          placeholder="Search items"
          className="w-full rounded-sm border border-border bg-bg-subtle py-1.5 pl-8 pr-7 text-xs text-fg placeholder:text-fg-faint focus:border-accent-border focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        {q ? (
          <button
            type="button"
            onClick={() => updateParam("q", null)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-fg-faint hover:bg-bg-muted hover:text-fg"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" strokeWidth={2} />
          </button>
        ) : null}
      </label>

      {/* Family chips */}
      {families.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <ChipButton
            active={family === ""}
            onClick={() => updateParam("family", null)}
            label="All families"
          />
          {families.map((f) => (
            <ChipButton
              key={f}
              active={family === f}
              onClick={() => updateParam("family", family === f ? null : f)}
              label={f}
            />
          ))}
        </div>
      ) : null}

      {/* At-risk-only toggle — refined as a switch, not a checkbox */}
      <label
        className="inline-flex shrink-0 cursor-pointer select-none items-center gap-2 text-xs font-medium text-fg"
        title="Show only items that are not Healthy"
      >
        <span className="text-[11px] uppercase tracking-sops text-fg-muted">
          Show only at-risk
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={atRiskOnly}
          onClick={() =>
            updateParam("at_risk_only", atRiskOnly ? "false" : null)
          }
          className={cn(
            "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors",
            atRiskOnly
              ? "border-accent-border bg-accent"
              : "border-border bg-bg-subtle",
          )}
        >
          <span
            className={cn(
              "inline-block h-3 w-3 transform rounded-full bg-bg-raised shadow-sm transition-transform",
              atRiskOnly ? "translate-x-3.5" : "translate-x-0.5",
            )}
          />
        </button>
      </label>
    </div>
  );
}

interface ChipButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

function ChipButton({ active, onClick, label }: ChipButtonProps) {
  // Operational Clarity v2: refined toggle states. Active = soft accent
  // wash + accent border; inactive = subtle bg + faint border. The active
  // state no longer floods the chip with full accent — too heavy in a row
  // of 17 chips.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-sm border px-2 py-1 text-[10px] font-medium uppercase tracking-sops transition-colors",
        active
          ? "border-accent-border bg-accent-soft text-accent"
          : "border-border bg-bg-subtle text-fg-muted hover:border-accent/40 hover:text-fg",
      )}
    >
      {label}
    </button>
  );
}
