// Tranche 090 (cleanup) — SKU hub: one door for SKU work.
//
// The spine audit (2026-06-26) flagged "where do I fix a SKU?" friction: three
// separate Admin nav entries (Mappings / Health / Aliases) for one mental
// domain. This hub collapses them into a single "SKU" nav entry that lands here
// and routes to the right facet. The three pages stay live at their existing
// URLs (deep-links like /admin/sku-aliases?item_id= unchanged) — this only adds
// a front door; it removes nothing. Admin-gated by the (admin) group layout.

import Link from "next/link";
import { ArrowLeftRight, ArrowRight, ShieldCheck, Tags } from "lucide-react";

const FACETS = [
  {
    href: "/admin/sku-map",
    label: "Mappings",
    blurb:
      "Map an integration SKU (LionWheel) to a canonical item. This is what clears “pre-anchor skipped” reconciliation exceptions.",
    icon: ArrowLeftRight,
  },
  {
    href: "/admin/sku-health",
    label: "Health",
    blurb: "Diagnose SKU mapping coverage and gaps — a read-only audit of what’s mapped, unmapped, or ambiguous.",
    icon: ShieldCheck,
  },
  {
    href: "/admin/sku-aliases",
    label: "Aliases",
    blurb: "Manage display names and alternate identifiers for items.",
    icon: Tags,
  },
] as const;

export default function AdminSkuHubPage() {
  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Admin</p>
        <h1 className="text-2xl font-semibold tracking-tightish text-fg-strong">SKU</h1>
        <p className="text-sm text-fg-muted">
          One place for SKU work. Pick the facet you need — mappings fix integration
          reconciliation, health diagnoses coverage, aliases manage display names.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {FACETS.map((f) => {
          const Icon = f.icon;
          return (
            <Link
              key={f.href}
              href={f.href}
              className="group flex flex-col gap-2 rounded-xl border border-border/70 bg-bg-raised p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 motion-reduce:hover:translate-y-0"
            >
              <span className="flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="text-[0.9375rem] font-semibold text-fg-strong">{f.label}</span>
                <ArrowRight
                  className="ml-auto h-3.5 w-3.5 -translate-x-1 text-accent opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none"
                  strokeWidth={2}
                  aria-hidden
                />
              </span>
              <span className="text-xs leading-relaxed text-fg-muted">{f.blurb}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
