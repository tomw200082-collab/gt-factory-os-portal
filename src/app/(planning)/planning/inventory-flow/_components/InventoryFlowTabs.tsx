"use client";

// ---------------------------------------------------------------------------
// InventoryFlowTabs — segmented control rendered at the top of both
// /planning/inventory-flow (FG) and /planning/inventory-flow/supply pages.
//
// Tab state is encoded in the URL via Next.js Link navigation; there is no
// shared client-side state to coordinate. Each page passes its own
// `activeTab` prop so the highlight is server-rendered consistent with the
// route the user is on.
//
// Tranche 075 (A11Y-009 / A11Y-021):
//   - Roving tabindex + Arrow / Home / End navigation across the two tabs
//     via the shared useRovingTabList hook. Activation = router.push to the
//     tab's href (matches "follow the existing selection callback" pattern
//     used elsewhere; here selection is route navigation).
//   - Active state is no longer color-only: the selected tab also reads
//     bolder (font-semibold) and carries a 2px underline, alongside the
//     existing bg-bg-raised lift + shadow + aria-selected. Inactive stays
//     font-medium with no underline.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useRovingTabList } from "@/components/a11y/useRovingTabList";

type Tab = "fg" | "supply";

const TAB_HREFS: Record<Tab, string> = {
  fg: "/planning/inventory-flow",
  supply: "/planning/inventory-flow/supply",
};

// A11Y-R08 (Tranche 079) — stable tab ids exported so the FG and supply
// client pages can reference them from their `<div role="tabpanel"
// aria-labelledby=…>` wrappers (the tabpanel's labelledby points at the
// currently-active tab's id).
export const INVENTORY_FLOW_TAB_IDS: Record<Tab, string> = {
  fg: "inv-flow-tab-fg",
  supply: "inv-flow-tab-supply",
};

export function InventoryFlowTabs({ activeTab }: { activeTab: Tab }) {
  const router = useRouter();
  const roving = useRovingTabList<Tab>({
    keys: ["fg", "supply"] as const,
    activeKey: activeTab,
    onChange: (next) => {
      router.push(TAB_HREFS[next]);
    },
    orientation: "horizontal",
  });

  return (
    // A11Y-R04 (Tranche 079) — the tablist sits on a `<div>` (was `<nav>`,
    // which created a duplicate navigation landmark inside the planning shell).
    <div
      {...roving.tabListProps}
      aria-label="Inventory flow view"
      className="inline-flex rounded-md border border-border bg-bg-muted p-0.5 text-sm"
    >
      {(() => {
        const tp = roving.getTabProps("fg");
        return (
          <Link
            href={TAB_HREFS.fg}
            id={INVENTORY_FLOW_TAB_IDS.fg}
            role={tp.role}
            tabIndex={tp.tabIndex}
            aria-selected={tp["aria-selected"]}
            ref={(el) => tp.ref(el)}
            onKeyDown={tp.onKeyDown}
            className={cn(
              // FLOW-M17: py-2 lifts the touch target to ≥36px (32px minimum).
              "inline-flex items-center px-3 py-2 rounded-sm transition-colors",
              activeTab === "fg"
                ? "bg-bg-raised text-fg-strong font-semibold underline underline-offset-4 decoration-2 shadow-sm"
                : "text-fg-muted font-medium hover:text-fg",
            )}
          >
            Finished Goods
          </Link>
        );
      })()}
      {(() => {
        const tp = roving.getTabProps("supply");
        return (
          <Link
            href={TAB_HREFS.supply}
            id={INVENTORY_FLOW_TAB_IDS.supply}
            role={tp.role}
            tabIndex={tp.tabIndex}
            aria-selected={tp["aria-selected"]}
            ref={(el) => tp.ref(el)}
            onKeyDown={tp.onKeyDown}
            className={cn(
              "inline-flex items-center px-3 py-2 rounded-sm transition-colors",
              activeTab === "supply"
                ? "bg-bg-raised text-fg-strong font-semibold underline underline-offset-4 decoration-2 shadow-sm"
                : "text-fg-muted font-medium hover:text-fg",
            )}
          >
            Components
          </Link>
        );
      })()}
    </div>
  );
}
