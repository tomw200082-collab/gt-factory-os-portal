import { PendingSurfacePlaceholder } from "@/components/system/PendingSurfacePlaceholder";

export default function AdminSignalsPage() {
  return (
    <PendingSurfacePlaceholder
      eyebrow="Admin · system"
      title="Signals"
      description="Control-tower signals surface — break-glass state, rebuild_verifier drift, stock anchors, last parity check, and the RUNTIME_READY registry — is blocked on backend endpoints. These same signals are rendered on the dashboard as pending placeholders today and will light up here in richer detail once the endpoints are authored."
      missingEndpoints={[
        "GET /api/v1/queries/signals/break-glass",
        "GET /api/v1/queries/stock/truth",
        "GET /api/v1/queries/runtime-ready",
      ]}
      note="Authoritative sources today are the harness file .claude/state/runtime_ready.json (RUNTIME_READY) and the private_core stock-ledger tables (rebuild verifier). The portal does not — and must not — read either at runtime."
    />
  );
}
