// ---------------------------------------------------------------------------
// QuarantinedPage
//
// Replaces the body of a route that previously rendered in-browser fixtures
// (from src/lib/fixtures/* or the IndexedDB-backed src/lib/repositories layer)
// with a truthful "not yet live" surface. No fixture import; no fake data.
//
// Used during production cutover to prevent fixture-backed scaffold screens
// from rendering fake factory data in production.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";

export interface QuarantinedPageProps {
  title: string;
  /**
   * Short explanation for the specific route. Leave undefined to use the
   * default cutover disclaimer.
   */
  description?: string;
}

const LIVE_MODULES: Array<{ label: string; href: string; blurb: string }> = [
  {
    label: "Planning Runs",
    href: "/planning/runs",
    blurb: "Review planning runs + purchase/production recommendations (live).",
  },
  {
    label: "Forecast",
    href: "/planning/forecast",
    blurb: "Create / edit / publish forecast versions (live).",
  },
  {
    label: "Exceptions Inbox",
    href: "/exceptions",
    blurb: "Acknowledge and resolve live operational exceptions (live).",
  },
];

const DEFAULT_DESCRIPTION =
  "This screen is not yet wired to live factory data. It will ship in a future cycle. Use the live operational modules below in the meantime.";

export function QuarantinedPage({ title, description }: QuarantinedPageProps) {
  return (
    <>
      <WorkflowHeader
        eyebrow="Not yet live"
        title={title}
        description={description ?? DEFAULT_DESCRIPTION}
      />
      <SectionCard
        eyebrow="Live modules"
        title="Use these in the meantime"
        description="These routes are wired against production data."
      >
        <ul className="divide-y divide-border/60">
          {LIVE_MODULES.map((m) => (
            <li key={m.href} className="py-3 first:pt-0 last:pb-0">
              <Link
                href={m.href}
                className="flex items-baseline justify-between gap-4 hover:underline"
              >
                <span className="font-medium">{m.label}</span>
                <span className="text-sm text-muted-foreground">{m.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>
    </>
  );
}
