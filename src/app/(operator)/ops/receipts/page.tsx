import { QuarantinedPage } from "@/components/system/QuarantinedPage";

export default function OpsReceiptsPage() {
  return (
    <QuarantinedPage
      title="Goods receipt"
      description="The goods-receipt form exists on live API at /api/v1/mutations/goods-receipts, but the UI dropdowns (items / components / suppliers) currently render from in-browser fixtures rather than live master data. Form is quarantined until dropdowns are wired to live API reads."
    />
  );
}
