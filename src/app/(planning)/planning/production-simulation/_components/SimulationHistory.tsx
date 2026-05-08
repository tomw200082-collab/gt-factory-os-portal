"use client";

// ---------------------------------------------------------------------------
// SimulationHistory — collapsible sidebar panel showing last 5 simulation
// runs stored in localStorage. Each entry shows timestamp, product name,
// target qty, feasibility %, and the worst-blocked component.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, Clock, Trash2, ClipboardCopy, Check, Download } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SimHistoryEntry {
  id: string; // timestamp-based key
  timestamp: number;
  productName: string;
  scenarioLabel: string;
  targetQty: number;
  feasibilityPct: number;
  covered: number;
  partial: number;
  notCovered: number;
  total: number;
  keyBlocker: string | null; // name of worst-shortage component
}

const STORAGE_KEY = "gt_sim_history_v1";
const MAX_ENTRIES = 5;

export function loadHistory(): SimHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SimHistoryEntry[];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: SimHistoryEntry): void {
  if (typeof window === "undefined") return;
  try {
    const existing = loadHistory();
    const deduped = existing.filter((e) => e.id !== entry.id);
    const updated = [entry, ...deduped].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage quota exceeded or disabled — silently ignore
  }
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

interface FeasibilityBadgeProps {
  pct: number;
}

function FeasibilityBadge({ pct }: FeasibilityBadgeProps) {
  const colorClass =
    pct >= 80
      ? "bg-success-softer border-success/30 text-success-fg"
      : pct >= 40
        ? "bg-warning-softer border-warning/30 text-warning-fg"
        : "bg-danger-softer border-danger/30 text-danger-fg";

  return (
    <span
      className={cn(
        "shrink-0 rounded-sm border px-1.5 py-0.5 text-3xs font-bold tabular-nums",
        colorClass,
      )}
    >
      {pct}%
    </span>
  );
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface CopyConfigChipProps {
  entry: SimHistoryEntry;
}

function CopyConfigChip({ entry }: CopyConfigChipProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const config = {
        productName: entry.productName,
        scenarioLabel: entry.scenarioLabel,
        targetQty: entry.targetQty,
      };
      navigator.clipboard
        .writeText(JSON.stringify(config, null, 2))
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          // clipboard not available — silently ignore
        });
    },
    [entry],
  );

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy scenario config as JSON"
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-3xs font-medium transition-colors",
        copied
          ? "border-success/40 bg-success-softer text-success-fg"
          : "border-border/50 bg-transparent text-fg-faint hover:border-accent/40 hover:text-fg-muted",
      )}
    >
      {copied ? (
        <>
          <Check className="h-2.5 w-2.5" strokeWidth={2.5} />
          Copied
        </>
      ) : (
        <>
          <ClipboardCopy className="h-2.5 w-2.5" strokeWidth={2} />
          Copy config
        </>
      )}
    </button>
  );
}

interface SimulationHistoryProps {
  /** Currently committed scenario — highlighted in the list */
  currentId?: string;
  /** Called when user clicks "Load" on a history entry */
  onLoad?: (entry: SimHistoryEntry) => void;
}

export function SimulationHistory({ currentId, onLoad }: SimulationHistoryProps) {
  const [open, setOpen] = useState(true);
  const [entries, setEntries] = useState<SimHistoryEntry[]>([]);
  const [historyCopied, setHistoryCopied] = useState(false);

  // Reload from localStorage whenever the panel mounts or re-renders
  useEffect(() => {
    setEntries(loadHistory());
  }, []);

  // Expose a refresh function via custom event so SimulationResults can
  // trigger a re-render after saving a new entry.
  useEffect(() => {
    const handler = () => setEntries(loadHistory());
    window.addEventListener("gt:sim-history-updated", handler);
    return () => window.removeEventListener("gt:sim-history-updated", handler);
  }, []);

  const handleClear = () => {
    clearHistory();
    setEntries([]);
  };

  const handleExportHistory = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (entries.length === 0) return;
      const dateStr = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const lines: string[] = [
        `Simulation History — ${dateStr}`,
        "───────────────────────────",
      ];
      for (const entry of entries) {
        const label = entry.scenarioLabel ? `${entry.scenarioLabel} (${entry.productName})` : entry.productName;
        lines.push(`${label} × ${entry.targetQty.toLocaleString()} → ${entry.total} components required`);
        const simDate = new Date(entry.timestamp).toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        lines.push(`Simulated: ${simDate}`);
        lines.push("───");
      }
      lines.push("───────────────────────────");
      lines.push(`${entries.length} simulation${entries.length !== 1 ? "s" : ""}`);
      const text = lines.join("\n");
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setHistoryCopied(true);
          setTimeout(() => setHistoryCopied(false), 1500);
        })
        .catch(() => {
          // clipboard not available — silently ignore
        });
    },
    [entries],
  );

  return (
    <aside className="card overflow-hidden">
      {/* Header */}
      <div className="flex w-full items-center gap-2 border-b border-border/70 bg-gradient-to-b from-bg-raised to-bg/40 px-4 py-3">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <Clock className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />
          <span className="text-xs font-semibold text-fg-strong">
            Simulation history
          </span>
          {entries.length > 0 && (
            <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent-soft px-1 text-3xs font-bold text-accent">
              {entries.length}
            </span>
          )}
        </button>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={handleExportHistory}
            title="Copy simulation history to clipboard"
            className={cn(
              "text-3xs rounded border border-border/50 bg-bg-subtle text-fg-muted hover:text-fg-strong px-2 py-1 transition-colors shrink-0",
              historyCopied && "border-success/40 bg-success-softer text-success-fg",
            )}
          >
            {historyCopied ? (
              <span className="flex items-center gap-1">
                <Check className="h-2.5 w-2.5" strokeWidth={2.5} />
                Copied!
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Download className="h-2.5 w-2.5" strokeWidth={2} />
                Export
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          className="shrink-0"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Collapse history" : "Expand history"}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />
          )}
        </button>
      </div>

      {/* Body */}
      {open && (
        <div className="p-3">
          {entries.length === 0 ? (
            <p className="py-4 text-center text-xs text-fg-muted">
              No simulations run yet in this session.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map((entry) => {
                const isCurrent = entry.id === currentId;
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "rounded-md border p-3 transition-colors",
                      isCurrent
                        ? "border-accent/40 bg-accent-soft/20"
                        : "border-border/60 bg-bg-subtle/40 hover:bg-bg-subtle/70",
                    )}
                  >
                    {/* Top row: headline + feasibility badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {/* Scenario label as headline */}
                        <div className="truncate text-xs font-semibold text-fg-strong leading-snug">
                          {entry.scenarioLabel || entry.productName}
                        </div>
                        {/* Product name as subtitle when label differs */}
                        {entry.scenarioLabel && entry.scenarioLabel !== entry.productName && (
                          <div className="truncate text-3xs text-fg-muted">
                            {entry.productName}
                          </div>
                        )}
                        {/* Timestamp as subtitle */}
                        <div className="mt-0.5 text-3xs text-fg-faint">
                          {formatRelativeTime(entry.timestamp)}
                        </div>
                      </div>
                      <FeasibilityBadge pct={entry.feasibilityPct} />
                    </div>

                    {/* Stats row */}
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-3xs text-fg-muted">
                      <span>
                        <span className="font-semibold text-fg">
                          {entry.targetQty.toLocaleString()}
                        </span>{" "}
                        units
                      </span>
                      <span>
                        <span className="font-semibold text-fg">{entry.total}</span>{" "}
                        components
                      </span>
                      {entry.notCovered > 0 && (
                        <span className="text-danger-fg font-semibold">
                          {entry.notCovered} short
                        </span>
                      )}
                    </div>

                    {/* Blocker */}
                    {entry.keyBlocker && (
                      <div className="mt-1.5 truncate rounded-sm border border-danger/20 bg-danger-softer/30 px-2 py-0.5 text-3xs text-danger-fg">
                        Blocker: {entry.keyBlocker}
                      </div>
                    )}

                    {/* Footer: copy config chip + load button */}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <CopyConfigChip entry={entry} />
                      <div className="flex items-center gap-1.5">
                        {onLoad && !isCurrent && (
                          <button
                            type="button"
                            className="rounded-sm border border-border/60 bg-bg-raised px-2 py-0.5 text-3xs font-semibold text-fg-muted transition-colors hover:border-accent/40 hover:text-accent"
                            onClick={() => onLoad(entry)}
                          >
                            Load
                          </button>
                        )}
                        {isCurrent && (
                          <span className="text-3xs font-semibold text-accent">
                            Current
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Clear button */}
              <button
                type="button"
                className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-sm border border-border/50 py-1.5 text-3xs text-fg-muted transition-colors hover:border-danger/30 hover:text-danger-fg"
                onClick={handleClear}
              >
                <Trash2 className="h-3 w-3" strokeWidth={2} />
                Clear history
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
