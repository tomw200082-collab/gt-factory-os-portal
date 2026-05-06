"use client";

// ---------------------------------------------------------------------------
// InventoryFlowTabs — segmented control rendered at the top of both
// /planning/inventory-flow (FG) and /planning/inventory-flow/supply pages.
//
// Tab state is encoded in the URL via Next.js Link navigation; there is no
// shared client-side state to coordinate. Each page passes its own
// `activeTab` prop so the highlight is server-rendered consistent with the
// route the user is on.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { cn } from "@/lib/cn";

type Tab = "fg" | "supply";

export function InventoryFlowTabs({ activeTab }: { activeTab: Tab }) {
  return (
    <nav
      role="tablist"
      aria-label="Inventory flow view"
      className="inline-flex rounded-md border border-border bg-muted p-0.5 text-sm"
    >
      <Link
        role="tab"
        aria-selected={activeTab === "fg"}
        href="/planning/inventory-flow"
        className={cn(
          "px-3 py-1.5 rounded-sm font-medium transition-colors",
          activeTab === "fg"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Finished Goods
      </Link>
      <Link
        role="tab"
        aria-selected={activeTab === "supply"}
        href="/planning/inventory-flow/supply"
        className={cn(
          "px-3 py-1.5 rounded-sm font-medium transition-colors",
          activeTab === "supply"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Supply (RM + Bought-Finished)
      </Link>
    </nav>
  );
}
