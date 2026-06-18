"use client";

import { EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

interface RowVisibilityToggleProps {
  itemId: string;
  itemName: string;
  /** When absent, no hide button renders (keeps default callers unchanged). */
  onHide?: (id: string) => void;
  /** When true, render a select checkbox instead of the hide button. */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  /** 'sm' = compact desktop hover control; 'touch' = ≥44px mobile target. */
  size?: "sm" | "touch";
}

export function RowVisibilityToggle({
  itemId,
  itemName,
  onHide,
  selectMode = false,
  selected = false,
  onToggleSelect,
  size = "sm",
}: RowVisibilityToggleProps) {
  const touch = size === "touch";

  if (selectMode) {
    return (
      <label
        className={cn(
          "inline-flex cursor-pointer items-center justify-center",
          touch ? "h-11 w-11" : "h-7 w-7",
        )}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect?.(itemId)}
          aria-label={`Select ${itemName}`}
          className="h-4 w-4 cursor-pointer"
        />
      </label>
    );
  }

  if (!onHide) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onHide(itemId);
      }}
      aria-label={`Hide ${itemName}`}
      title={`Hide ${itemName}`}
      className={cn(
        "inline-flex items-center justify-center rounded-sm text-fg-faint transition-colors hover:bg-bg-muted hover:text-fg-muted",
        touch ? "h-11 w-11" : "h-7 w-7 opacity-50 hover:opacity-100",
      )}
    >
      <EyeOff size={touch ? 18 : 14} strokeWidth={2} aria-hidden />
    </button>
  );
}
