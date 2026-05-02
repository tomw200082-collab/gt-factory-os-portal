"use client";

// ---------------------------------------------------------------------------
// PlannedOverlayToggle — header-level toggle that turns the planned-inflow
// overlay on/off. Default ON. Persists to localStorage so operator
// preference sticks across page loads + across mobile/desktop.
//
// Contract authority:
//   docs/integrations/inventory_flow_planned_inflow_overlay_contract.md
//   §5.1 (toggle requirements), §10 row 4 (default ON), §8.2 (mobile
//   placement — wrapped here; the parent decides where to render).
//
// Tom-locked dispatch invariants:
//   - Localization register = English/LTR.
//   - Default ON.
//   - Persistence key: "gtfos.inventoryFlow.plannedOverlayEnabled" (per
//     contract §5.1 recommendation).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const STORAGE_KEY = "gtfos.inventoryFlow.plannedOverlayEnabled";
const STORAGE_EVENT_KEY = "gtfos:plannedOverlayToggle";

/**
 * Read the persisted toggle state. Default ON.
 * SSR-safe — returns true on the server (matches first-paint default).
 */
export function readPlannedOverlayEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true; // default ON
    return raw === "true";
  } catch {
    return true;
  }
}

/**
 * Hook that returns the current overlay-enabled state and updates when
 * the user flips the toggle in another component / another tab.
 */
export function usePlannedOverlayEnabled(): boolean {
  // Default true to match SSR; flip after mount to the persisted value.
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    setEnabled(readPlannedOverlayEnabled());
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setEnabled(readPlannedOverlayEnabled());
      }
    }
    function onCustom(e: Event) {
      const detail = (e as CustomEvent<{ enabled: boolean }>).detail;
      if (detail && typeof detail.enabled === "boolean") {
        setEnabled(detail.enabled);
      }
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(STORAGE_EVENT_KEY, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(STORAGE_EVENT_KEY, onCustom as EventListener);
    };
  }, []);
  return enabled;
}

interface PlannedOverlayToggleProps {
  /** Optional className passthrough for layout positioning. */
  className?: string;
}

export function PlannedOverlayToggle({ className }: PlannedOverlayToggleProps) {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    setEnabled(readPlannedOverlayEnabled());
  }, []);

  const onToggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "true" : "false");
      } catch {
        // localStorage may be disabled — silently degrade; toggle still works
        // for the lifetime of the page session.
      }
      try {
        window.dispatchEvent(
          new CustomEvent(STORAGE_EVENT_KEY, { detail: { enabled: next } }),
        );
      } catch {
        // ignore in environments without CustomEvent
      }
      return next;
    });
  }, []);

  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 select-none",
        "rounded-sm border border-border/50 bg-bg-raised px-2 py-1",
        "text-2xs font-medium text-fg-muted hover:text-fg",
        // Touch target ≥ 44px on mobile per dispatch validation gate 5.
        // Vertical hit area is forced to 44px on touch viewports; desktop
        // collapses to a tighter 28px so the header stays compact.
        "min-h-[44px] sm:min-h-[28px]",
        className,
      )}
      data-testid="planned-overlay-toggle"
      title={
        enabled
          ? "Hide planned-production overlay on the inventory grid."
          : "Show planned-production overlay on the inventory grid."
      }
    >
      <input
        type="checkbox"
        className="h-3.5 w-3.5 cursor-pointer accent-info"
        checked={enabled}
        onChange={onToggle}
        aria-label="Show planned-production overlay"
      />
      <span className="uppercase tracking-sops">
        {enabled ? "Hide planned" : "Show planned"}
      </span>
    </label>
  );
}
