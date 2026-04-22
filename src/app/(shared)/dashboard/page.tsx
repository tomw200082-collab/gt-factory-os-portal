import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { KpiTiles } from "@/components/dashboard/KpiTiles";

// Tranche 017: force dynamic rendering. This page reads the per-user
// Supabase session server-side via createSupabaseServerClient(), which
// requires NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.
// Without `force-dynamic`, Next.js attempts to statically generate the
// page at build time — when Supabase env vars are unavailable to the
// build step (typical in Vercel preview deploys), the prerender crashes
// and takes the whole build down. This page is inherently per-request,
// so SSG isn't appropriate; marking it dynamic fixes the deploy.
export const dynamic = "force-dynamic";

const LIVE_MODULES: Array<{ label: string; href: string; blurb: string }> = [
  {
    label: "Planning Runs",
    href: "/planning/runs",
    blurb:
      "Review planning runs + purchase/production recommendations. Live against production data.",
  },
  {
    label: "Forecast",
    href: "/planning/forecast",
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
        description="Live portal against production data. The tiles below are live counts; the modules section links you into each workflow."
      />

      <KpiTiles />

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
