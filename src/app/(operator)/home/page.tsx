"use client";

import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  PackageOpen,
  Sliders,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { SEED_SUBMISSIONS } from "@/lib/fixtures/submissions";

const ACTIONS = [
  {
    href: "/ops/receipts",
    title: "Goods Receipt",
    description: "Record arriving goods against a PO or unlinked.",
    icon: PackageOpen,
    accent: "from-accent/10 to-accent/0",
  },
  {
    href: "/ops/waste-adjustments",
    title: "Waste / Adjustment",
    description: "Log a loss or a positive correction with reason.",
    icon: Sliders,
    accent: "from-warning/10 to-warning/0",
  },
  {
    href: "/ops/counts",
    title: "Physical Count",
    description: "Blind count. System quantity is hidden until submit.",
    icon: ClipboardCheck,
    accent: "from-info/10 to-info/0",
  },
] as const;

export default function OperatorHomePage() {
  const recent = SEED_SUBMISSIONS.slice(0, 5);

  return (
    <>
      <WorkflowHeader
        eyebrow="Operator"
        title="Today's work"
        description="Quick actions and your recent submissions. Submit behavior is mocked in this shell build — nothing hits a ledger."
      />

      <div className="space-y-6">
        <SectionCard
          eyebrow="Quick actions"
          title="Report an operational event"
          description="Three operator forms, each tuned to a single kind of event. Blind UX on counts; asymmetric direction on adjustments."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.href}
                  href={a.href}
                  className="group relative flex flex-col gap-3 overflow-hidden rounded-md border border-border/70 bg-bg-raised p-4 transition-all duration-150 ease-out-quart hover:-translate-y-px hover:border-accent/50 hover:shadow-raised"
                >
                  <div
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${a.accent} opacity-0 transition-opacity duration-200 group-hover:opacity-100`}
                    aria-hidden
                  />
                  <div className="relative flex h-9 w-9 items-center justify-center rounded border border-border/70 bg-bg-subtle text-fg-muted group-hover:border-accent/40 group-hover:bg-accent-soft group-hover:text-accent">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <div className="relative">
                    <div className="text-sm font-semibold tracking-tightish text-fg-strong">
                      {a.title}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-fg-muted">
                      {a.description}
                    </div>
                  </div>
                  <div className="relative mt-auto flex items-center gap-1 text-3xs font-semibold uppercase tracking-sops text-fg-subtle group-hover:text-accent">
                    Open form
                    <ArrowRight
                      className="h-3 w-3 transition-transform duration-150 group-hover:translate-x-0.5"
                      strokeWidth={2}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Recent submissions"
          title="Last five submissions"
          description="Your most recent work, linked to their approval and committed state."
          actions={
            <Link
              href="/my-submissions"
              className="btn btn-ghost btn-sm gap-1.5"
            >
              View all
              <ArrowRight className="h-3 w-3" strokeWidth={2} />
            </Link>
          }
        >
          <ul className="divide-y divide-border/60">
            {recent.map((s) => (
              <li
                key={s.id}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-3xs uppercase tracking-sops text-fg-subtle">
                    <span className="font-mono text-fg-muted">
                      {s.form_type.replace("_", " ")}
                    </span>
                    <span className="text-fg-faint">·</span>
                    <span className="font-mono">
                      {new Date(s.event_at).toLocaleString(undefined, {
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-sm font-medium text-fg-strong">
                    {s.summary}
                  </div>
                </div>
                <StatusBadge state={s.state} />
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
