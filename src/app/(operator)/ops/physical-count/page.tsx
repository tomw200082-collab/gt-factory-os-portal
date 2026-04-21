import { QuarantinedPage } from "@/components/system/QuarantinedPage";

export default function OpsPhysicalCountPage() {
  return (
    <QuarantinedPage
      title="Physical count"
      description="The physical-count form exists on live API at /api/v1/mutations/physical-counts, but the UI dropdowns (items / components) currently render from in-browser fixtures rather than live master data. Form is quarantined until dropdowns are wired to live API reads."
    />
  );
}
