"use client";

// ---------------------------------------------------------------------------
// UnmappedSkusBanner — hard banner that REPLACES the grid when
//   summary.unknown_sku_pct_of_demand >= 0.10.
//
// Per contract §5 + amendment §B: rendering is "all-or-banner". No silent
// partial. CTA links to /admin/sku-aliases.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { AlertOctagon, ArrowRight } from "lucide-react";
import { fmtPct } from "../_lib/format";

interface UnmappedSkusBannerProps {
  fraction: number; // [0,1]
}

export function UnmappedSkusBanner({ fraction }: UnmappedSkusBannerProps) {
  return (
    <div
      role="alert"
      className="relative overflow-hidden rounded-md border border-danger/30 bg-danger-softer/60 px-6 py-8 reveal"
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-danger" aria-hidden />
      <div className="flex items-start gap-4">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-danger/30 bg-danger-soft text-danger">
          <AlertOctagon className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tightish text-danger-fg">
            Cannot trust projections —{" "}
            <span className="tabular-nums">{fmtPct(fraction)}</span> of demand has
            unmapped SKUs
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">
            More than 10% of LionWheel demand in the next 14 days does not
            resolve to an item in the master data. Until those SKUs are
            mapped, the daily flow projection is incomplete and unsafe to act
            on.
          </p>
          <div className="mt-4">
            <Link
              href="/admin/sku-aliases"
              className="inline-flex items-center gap-1.5 rounded-sm border border-danger/40 bg-bg-raised px-3 py-1.5 text-xs font-semibold tracking-tightish text-danger-fg hover:bg-danger-soft"
            >
              Map SKU aliases
              <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
