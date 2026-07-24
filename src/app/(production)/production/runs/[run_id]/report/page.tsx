import type { Metadata } from "next";
import { ReportForm } from "./_components/ReportForm";

// ---------------------------------------------------------------------------
// /production/runs/[run_id]/report — the end-of-run report screen. Thin server
// shell that resolves the route param and hands it to the <ReportForm> client
// orchestrator (run query + form state + report mutation live there).
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Finish the run · Production",
};

export default async function ProductionRunReportPage({
  params,
}: {
  params: Promise<{ run_id: string }>;
}) {
  const { run_id } = await params;
  return <ReportForm runId={run_id} />;
}
