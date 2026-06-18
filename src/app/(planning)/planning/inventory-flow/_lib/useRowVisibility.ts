"use client";

import { useCallback, useState } from "react";

export interface RowVisibility {
  hiddenIds: Set<string>;
  hiddenCount: number;
  isHidden: (id: string) => boolean;
  hide: (id: string) => void;
  restore: (id: string) => void;
  showAll: () => void;
  focusMode: boolean;
  enterFocus: () => void;
  cancelFocus: () => void;
  selectedIds: Set<string>;
  selectedCount: number;
  isSelected: (id: string) => boolean;
  toggleSelect: (id: string) => void;
  /** Hide every id in visibleIds that is NOT currently selected; exit focus. */
  confirmFocus: (visibleIds: string[]) => void;
}

/**
 * Ephemeral per-session row visibility for the Inventory Flow grid.
 * State lives here (useState) so it survives TanStack background refetch
 * (the component does not remount) and resets only on a full page reload.
 */
export function useRowVisibility(): RowVisibility {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [focusMode, setFocusMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const hide = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const restore = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const showAll = useCallback(() => setHiddenIds(new Set()), []);

  const enterFocus = useCallback(() => {
    setSelectedIds(new Set());
    setFocusMode(true);
  }, []);

  const cancelFocus = useCallback(() => {
    setSelectedIds(new Set());
    setFocusMode(false);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Not memoized: must read the current `selectedIds` closure.
  const confirmFocus = (visibleIds: string[]) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (!selectedIds.has(id)) next.add(id);
      }
      return next;
    });
    setSelectedIds(new Set());
    setFocusMode(false);
  };

  return {
    hiddenIds,
    hiddenCount: hiddenIds.size,
    isHidden: (id) => hiddenIds.has(id),
    hide,
    restore,
    showAll,
    focusMode,
    enterFocus,
    cancelFocus,
    selectedIds,
    selectedCount: selectedIds.size,
    isSelected: (id) => selectedIds.has(id),
    toggleSelect,
    confirmFocus,
  };
}
