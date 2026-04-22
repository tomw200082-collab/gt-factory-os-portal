import { PendingSurfacePlaceholder } from "@/components/system/PendingSurfacePlaceholder";

export default function IntegrationsAdminPage() {
  return (
    <PendingSurfacePlaceholder
      eyebrow="Admin · system"
      title="Integrations"
      description="Connection health, per-producer freshness, credential configuration, and resync controls for the boundary systems (LionWheel for orders + shipments, Shopify for FG stock outbound, Green Invoice for supplier invoice + price evidence) are not yet exposed to the portal. Integration runs are logged server-side in private_core.integration_runs; no read or admin endpoint is proxied yet."
      missingEndpoints={[
        "GET /api/v1/queries/integrations",
        "GET /api/v1/queries/integrations/freshness",
        "GET /api/v1/queries/integration-runs?producer=<id>",
        "POST /api/v1/mutations/integrations/:id/resync",
      ]}
      note="The dashboard Integration freshness panel reads the same upstream view (api_read.v_integration_freshness); it will light up together with this surface."
    />
  );
}
