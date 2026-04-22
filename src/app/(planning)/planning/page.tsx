import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";

// Minimal planning landing page introduced in Tranche A of
// portal-full-production-refactor. Full content (live pipeline widgets,
// freshness cards, run-queue snapshot) lands in Tranche C.
//
// This shell is deliberately thin so the /planning URL resolves (sidebar
// links here) rather than 404ing. Links forward users to the three live
// downstream surfaces.

const PLANNING_LINKS: Array<{ label: string; href: string; blurb: string }> = [
  {
    label: "Forecast",
    href: "/planning/forecast",
    blurb:
      "Create, edit, and publish forecast versions (8-week horizon).",
  },
  {
    label: "Planning runs",
    href: "/planning/runs",
    blurb:
      "Review planning runs, purchase recommendations, production recommendations.",
  },
  {
    label: "Purchase orders",
    href: "/purchase-orders",
    blurb:
      "Browse open purchase orders converted from recommendations.",
  },
];

export default function PlanningLandingPage() {
  return (
    <>
      <WorkflowHeader
        eyebrow="Planning"
        title="Planning workspace"
        description="Entry point to forecast, runs, and purchase orders."
      />
      <SectionCard
        eyebrow="Jump to"
        title="Live surfaces"
        description="Each link below routes to a live planning surface."
      >
        <ul className="divide-y divide-border/60">
          {PLANNING_LINKS.map((m) => (
            <li key={m.href} className="py-3 first:pt-0 last:pb-0">
              <Link
                href={m.href}
                className="flex items-baseline justify-between gap-4 hover:underline"
              >
                <span className="font-medium">{m.label}</span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  {m.blurb}
                  <ArrowRight className="h-3 w-3" strokeWidth={2} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>
    </>
  );
}
