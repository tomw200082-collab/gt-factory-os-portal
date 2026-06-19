"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, RotateCcw } from "lucide-react";

interface RowFocusControlsProps {
  focusMode: boolean;
  onEnterFocus: () => void;
  onCancelFocus: () => void;
  onConfirmFocus: () => void;
  selectedCount: number;
  hideOtherCount: number;
  hiddenItems: { item_id: string; item_name: string }[];
  onRestore: (id: string) => void;
  onShowAll: () => void;
}

export function RowFocusControls({
  focusMode,
  onEnterFocus,
  onCancelFocus,
  onConfirmFocus,
  selectedCount,
  hideOtherCount,
  hiddenItems,
  onRestore,
  onShowAll,
}: RowFocusControlsProps) {
  const [trayOpen, setTrayOpen] = useState(false);
  const hiddenCount = hiddenItems.length;

  useEffect(() => {
    if (hiddenCount === 0) setTrayOpen(false);
  }, [hiddenCount]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!focusMode ? (
        <button
          type="button"
          onClick={onEnterFocus}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-bg-subtle px-2.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-accent/40 hover:text-fg"
        >
          <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Focus
        </button>
      ) : (
        <div className="inline-flex items-center gap-2 rounded-sm border border-accent-border bg-accent-soft px-2.5 py-1.5 text-xs">
          <span className="text-fg-muted">Pick rows to keep</span>
          <button
            type="button"
            onClick={onConfirmFocus}
            disabled={selectedCount === 0}
            className="inline-flex items-center gap-1 rounded-sm border border-accent-border bg-bg-raised px-2 py-1 font-medium text-accent transition-opacity hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            <EyeOff className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Hide the other {hideOtherCount}
          </button>
          <button
            type="button"
            onClick={onCancelFocus}
            className="rounded-sm px-2 py-1 text-fg-muted transition-colors hover:text-fg"
          >
            Cancel
          </button>
        </div>
      )}

      {hiddenCount > 0 ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setTrayOpen((o) => !o)}
            aria-expanded={trayOpen}
            aria-haspopup="menu"
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-bg-subtle px-2.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <EyeOff className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Hidden ({hiddenCount})
          </button>
          {trayOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-40 mt-1 w-64 rounded-md border border-border bg-bg-raised p-1 shadow-lg"
            >
              <ul className="max-h-64 overflow-y-auto">
                {hiddenItems.map((it) => (
                  <li
                    key={it.item_id}
                    className="flex items-center justify-between gap-2 rounded-sm px-2 py-1 hover:bg-bg-subtle"
                  >
                    <span className="truncate text-xs text-fg">{it.item_name}</span>
                    <button
                      type="button"
                      onClick={() => onRestore(it.item_id)}
                      aria-label={`Restore ${it.item_name}`}
                      title="Restore"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-fg-faint transition-colors hover:bg-bg-muted hover:text-fg"
                    >
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-1 border-t border-border/60 pt-1">
                <button
                  type="button"
                  data-testid="show-all"
                  onClick={() => {
                    onShowAll();
                    setTrayOpen(false);
                  }}
                  className="w-full rounded-sm px-2 py-1.5 text-left text-xs font-medium text-accent hover:bg-accent-soft"
                >
                  Show all
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
