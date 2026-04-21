import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";

const LIVE_MODULES: Array<{ label: string; href: string; blurb: string }> = [
  {
    label: "Planner — Planning Runs",
    href: "/planner/runs",
    blurb:
      "Review planning runs + purchase/production recommendations. Live against production data.",
  },
  {
    label: "Planner — Forecast",
    href: "/planner/forecast",
    blurb:
      "Create, edit, and publish forecast versions (8-week horizon). Live.",
  },
  {
    label: "Exceptions Inbox",
    href: "/exceptions",
    blurb:
      "Acknowledge and resolve live operational exceptions (integration freshness, unmapped SKUs, count discrepancies).",
  },
];

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email ?? "";
  const greeting = email ? `Welcome, ${email}` : "Welcome";

  return (
    <>
      <WorkflowHeader
        eyebrow="GT Factory OS"
        title={greeting}
        description="Operational modules below are live against production data. Dashboard analytics tiles are not yet wired and will ship in a future cycle — this landing surface links you straight to what is live."
      />

      <SectionCard
        eyebrow="Live modules"
        title="What you can do now"
        description="Every module below reads and writes against the live Supabase + Railway API. No fixtures."
      >
        <ul className="divide-y divide-border/60">
          {LIVE_MODULES.map((m) => (
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
