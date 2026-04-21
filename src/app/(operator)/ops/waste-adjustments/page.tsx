import { QuarantinedPage } from "@/components/system/QuarantinedPage";

export default function OpsWasteAdjustmentsPage() {
  return (
    <QuarantinedPage
      title="Waste / adjustment"
      description="The waste-adjustment form exists on live API at /api/v1/mutations/waste-adjustments, but the UI dropdowns (items / components) currently render from in-browser fixtures rather than live master data. Form is quarantined until dropdowns are wired to live API reads."
    />
  );
}
