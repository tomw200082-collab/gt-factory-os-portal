import type { Metadata } from "next";
import { PickList } from "./_components/PickList";

// ---------------------------------------------------------------------------
// /production/runs/[run_id] — the stage-aware picking screen. Thin server shell
// that resolves the route param and hands it to the <PickList> client
// orchestrator (query + resolve-gate state + confirm mutation live there).
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Collect · Production",
};

export default async function ProductionRunPage({
  params,
}: {
  params: Promise<{ run_id: string }>;
}) {
  const { run_id } = await params;
  return <PickList runId={run_id} />;
}
