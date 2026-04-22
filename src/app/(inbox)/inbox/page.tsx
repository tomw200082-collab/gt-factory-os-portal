import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";

// Minimal inbox landing placeholder introduced in Tranche A of
// portal-full-production-refactor. The unified inbox listing (typed rows
// from approvals + exceptions + etc.) is Tranche B's scope per plan §D.
//
// This shell keeps the nav link to /inbox from 404ing and forwards users
// to the existing approval surfaces via deep links until the listing
// lands.

const FALLBACK_LINKS: Array<{ label: string; href: string; blurb: string }> = [
  {
    label: "Exceptions",
    href: "/exceptions",
    blurb:
      "Open exceptions list (integration freshness, unmapped SKUs, count discrepancies).",
  },
];

export default function InboxLandingPage() {
  return (
    <>
      <WorkflowHeader
        eyebrow="Inbox"
        title="Inbox"
        description="Unified triage surface. The typed rows (approvals + exceptions + flags) land in a follow-on cycle; use the deep links below in the meantime."
      />
      <SectionCard
        eyebrow="Available now"
        title="Live triage surfaces"
        description="Each link below reaches a live surface."
      >
        <ul className="divide-y divide-border/60">
          {FALLBACK_LINKS.map((m) => (
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
