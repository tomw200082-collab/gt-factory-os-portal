"use client";

// ---------------------------------------------------------------------------
// useRovingTabList — shared roving-tabindex + arrow-key navigation for any
// element that wires `role="tablist"` with N children carrying `role="tab"`.
//
// Owner: Tranche 075 (planning accessibility pack) — replaces the ad-hoc
// tablist semantics on /planning/forecast, /planning/runs, /planning/runs/
// [run_id], and /planning/inventory-flow. Keeps churn minimal: callers pass an
// ordered list of tab keys + the active key + the selection callback, then
// spread the per-tab and per-container props returned here onto their existing
// buttons / Link elements.
//
// Behaviour (WAI-ARIA Authoring Practices "Tabs with Automatic Activation"):
//   - ArrowRight / ArrowDown        → next tab (wraps to first at the end)
//   - ArrowLeft  / ArrowUp          → previous tab (wraps to last at the start)
//   - Home                          → first tab
//   - End                           → last tab
//   - Roving tabindex               → selected tab is tabIndex=0, others -1
//   - Moving focus activates the tab (the hook calls onChange(nextKey) and
//     focuses the next tab's DOM node).
//
// Dependency-light: React only. No event listeners attached to window.
// ---------------------------------------------------------------------------

import {
  useCallback,
  useMemo,
  useRef,
  type KeyboardEvent,
} from "react";

export interface UseRovingTabListOptions<Key extends string> {
  /** Ordered list of tab keys; index drives arrow / Home / End navigation. */
  keys: readonly Key[];
  /** Currently active tab key. Must be one of `keys` (otherwise treated as 0). */
  activeKey: Key;
  /** Called when the active key should change (arrow / Home / End). */
  onChange: (next: Key) => void;
  /**
   * Optional orientation; defaults to "horizontal". Per ARIA APG, vertical
   * lists swap Left/Right ↔ Up/Down semantics; we accept both pairs either
   * way to match the existing repo behaviour and keep the hook forgiving.
   */
  orientation?: "horizontal" | "vertical";
}

export interface RovingTabListApi<Key extends string> {
  /** Spread on the `role="tablist"` container. */
  tabListProps: {
    role: "tablist";
    "aria-orientation": "horizontal" | "vertical";
  };
  /**
   * Build the per-tab props for a given key.
   * Spread onto each `role="tab"` element (button, anchor, or Link).
   */
  getTabProps: (key: Key) => {
    role: "tab";
    tabIndex: 0 | -1;
    "aria-selected": boolean;
    ref: (el: HTMLElement | null) => void;
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  };
}

export function useRovingTabList<Key extends string>(
  opts: UseRovingTabListOptions<Key>,
): RovingTabListApi<Key> {
  const { keys, activeKey, onChange, orientation = "horizontal" } = opts;

  // Stable ref map keyed by tab key. Keys can change over time (forecast
  // status filter, runs filter — all static today, but the hook stays
  // forgiving). We map key → DOM node so we can focus the right element
  // after onChange.
  const nodesRef = useRef<Map<Key, HTMLElement | null>>(new Map());

  const setNode = useCallback(
    (key: Key, el: HTMLElement | null) => {
      nodesRef.current.set(key, el);
    },
    [],
  );

  const indexOf = useCallback(
    (key: Key): number => {
      const idx = keys.indexOf(key);
      return idx < 0 ? 0 : idx;
    },
    [keys],
  );

  const focusKey = useCallback(
    (key: Key) => {
      // Defer focus to a microtask so the consumer's re-render (after
      // onChange) lands the new tabIndex=0 attribute before we move focus.
      queueMicrotask(() => {
        const el = nodesRef.current.get(key);
        if (el) el.focus();
      });
    },
    [],
  );

  const moveTo = useCallback(
    (key: Key) => {
      onChange(key);
      focusKey(key);
    },
    [onChange, focusKey],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (keys.length === 0) return;
      const i = indexOf(activeKey);
      // Accept both axes — see comment on `orientation` above.
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown": {
          e.preventDefault();
          const next = keys[(i + 1) % keys.length]!;
          moveTo(next);
          return;
        }
        case "ArrowLeft":
        case "ArrowUp": {
          e.preventDefault();
          const next = keys[(i - 1 + keys.length) % keys.length]!;
          moveTo(next);
          return;
        }
        case "Home": {
          e.preventDefault();
          moveTo(keys[0]!);
          return;
        }
        case "End": {
          e.preventDefault();
          moveTo(keys[keys.length - 1]!);
          return;
        }
        default:
          return;
      }
    },
    [keys, activeKey, indexOf, moveTo],
  );

  const tabListProps = useMemo(
    () =>
      ({
        role: "tablist" as const,
        "aria-orientation": orientation,
      }),
    [orientation],
  );

  const getTabProps = useCallback(
    (key: Key) => {
      const isActive = key === activeKey;
      return {
        role: "tab" as const,
        tabIndex: (isActive ? 0 : -1) as 0 | -1,
        "aria-selected": isActive,
        ref: (el: HTMLElement | null) => setNode(key, el),
        onKeyDown: handleKeyDown,
      };
    },
    [activeKey, setNode, handleKeyDown],
  );

  return { tabListProps, getTabProps };
}
