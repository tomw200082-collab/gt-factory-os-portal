import { QuarantinedPage } from "@/components/system/QuarantinedPage";

export default function IntegrationsAdminPage() {
  return (
    <QuarantinedPage
      title="Integrations (admin)"
      description="Boundary-system health (LionWheel, Shopify, Green Invoice) will land once the real /api/integrations/health endpoint is wired. The previous shell rendered hard-coded status and frozen last-sync timestamps, so it has been replaced with this honest placeholder."
    />
  );
}
