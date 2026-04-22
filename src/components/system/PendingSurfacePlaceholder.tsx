// ---------------------------------------------------------------------------
// PendingSurfacePlaceholder
//
// Honest placeholder for a route whose real functionality is blocked on a
// backend endpoint that does not yet have a portal proxy (or an upstream
// handler). Visual language matches the dashboard's PendingBadge (see
// src/app/(shared)/dashboard/page.tsx) so the same "pending_tranche_i" signal
// is rendered consistently across the portal.
//
// Use this in place of the retired QuarantinedPage. The difference:
// QuarantinedPage said "this screen is not wired yet — go use these other
// live modules instead". PendingSurfacePlaceholder says "this specific
// capability is blocked on these specific endpoints" and names them.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { CircleDashed, Info } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";

export interface PendingSurfacePlaceholderProps {
  eyebrow?: string;
  title: string;
  description: string;
  /** Backend endpoints whose absence is what makes this surface pending. */
  missingEndpoints?: string[];
  /** Optional secondary note — e.g. authoritative source of the underlying data. */
  note?: ReactNode;
  /** Optional extra content rendered below the main placeholder card. */
  children?: ReactNode;
}

export function PendingSurfacePlaceholder({
  eyebrow = "Pending backend",
  title,
  description,
  missingEndpoints,
  note,
  children,
}: PendingSurfacePlaceholderProps) {
  return (
    <>
      <WorkflowHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
      />
      <SectionCard
        eyebrow="Status"
        title="Pending Tranche I"
        description="This surface exists as a truthful placeholder. It will light up when the backend endpoints named below are authored and proxied."
      >
        <div
          className="flex items-start gap-3 rounded border border-border/60 bg-bg-subtle px-4 py-3 text-sm text-fg-muted"
          data-testid="pending-surface-placeholder"
        >
          <CircleDashed
            className="mt-0.5 h-4 w-4 shrink-0 text-fg-faint"
            strokeWidth={2}
          />
          <div className="min-w-0 space-y-2">
            <div className="font-semibold text-fg-strong">{title}</div>
            <p className="leading-relaxed">{description}</p>
            {missingEndpoints && missingEndpoints.length > 0 ? (
              <div className="mt-3">
                <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Missing backend endpoints
                </div>
                <ul className="mt-1.5 space-y-1">
                  {missingEndpoints.map((ep) => (
                    <li key={ep}>
                      <code className="rounded bg-bg-raised px-1.5 py-0.5 font-mono text-xs text-fg">
                        {ep}
                      </code>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {note ? (
              <div className="mt-3 flex items-start gap-2 rounded border border-info/40 bg-info-softer px-3 py-2 text-xs text-info-fg">
                <Info
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  strokeWidth={2}
                />
                <div className="leading-relaxed">{note}</div>
              </div>
            ) : null}
          </div>
        </div>
      </SectionCard>
      {children}
    </>
  );
}
