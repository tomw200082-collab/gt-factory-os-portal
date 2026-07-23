"use client";

// ---------------------------------------------------------------------------
// TodayBoardTabs — segmented control for the TodayBoard's three tabs.
//
// Same roving-tabindex pattern as InventoryFlowTabs
// (planning/inventory-flow/_components/InventoryFlowTabs.tsx), but the
// active tab lives in a `?tab=` query param on the SAME page (there is no
// per-tab route — Q6 locks this whole surface inside /home) instead of a
// route change, so activation calls router.replace(`?tab=…`) rather than
// following a Link.
// ---------------------------------------------------------------------------

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/cn";
import { useRovingTabList } from "@/components/a11y/useRovingTabList";

export type TodayBoardTabKey = "yesterday" | "today" | "tomorrow";

const TAB_KEYS: readonly TodayBoardTabKey[] = ["yesterday", "today", "tomorrow"] as const;

const TAB_LABEL: Record<TodayBoardTabKey, string> = {
  yesterday: "Yesterday",
  today: "Today",
  tomorrow: "Tomorrow",
};

export const TODAY_BOARD_TAB_IDS: Record<TodayBoardTabKey, string> = {
  yesterday: "today-board-tab-yesterday",
  today: "today-board-tab-today",
  tomorrow: "today-board-tab-tomorrow",
};

/** Type guard for the `?tab=` param — anything else falls back to "today". */
export function isTodayBoardTabKey(v: string | null | undefined): v is TodayBoardTabKey {
  return v === "yesterday" || v === "today" || v === "tomorrow";
}

export function TodayBoardTabs({ activeTab }: { activeTab: TodayBoardTabKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setTab = useCallback(
    (next: TodayBoardTabKey) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("tab", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const roving = useRovingTabList<TodayBoardTabKey>({
    keys: TAB_KEYS,
    activeKey: activeTab,
    onChange: setTab,
    orientation: "horizontal",
  });

  return (
    <div
      {...roving.tabListProps}
      aria-label="Today board"
      className="inline-flex rounded-md border border-border bg-bg-muted p-0.5 text-sm"
    >
      {TAB_KEYS.map((key) => {
        const tp = roving.getTabProps(key);
        const isActive = key === activeTab;
        return (
          <button
            key={key}
            type="button"
            id={TODAY_BOARD_TAB_IDS[key]}
            role={tp.role}
            tabIndex={tp.tabIndex}
            aria-selected={tp["aria-selected"]}
            ref={(el) => tp.ref(el)}
            onKeyDown={tp.onKeyDown}
            onClick={() => setTab(key)}
            className={cn(
              // Touch target ≥36px per the inventory-flow tab precedent.
              "inline-flex items-center px-3 py-2 rounded-sm transition-colors",
              isActive
                ? "bg-bg-raised text-fg-strong font-semibold underline underline-offset-4 decoration-2 shadow-sm"
                : "text-fg-muted font-medium hover:text-fg",
            )}
          >
            {TAB_LABEL[key]}
          </button>
        );
      })}
    </div>
  );
}
