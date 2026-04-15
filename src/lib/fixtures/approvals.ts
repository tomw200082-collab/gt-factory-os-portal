import type { ApprovalDto } from "@/lib/contracts/dto";

export const SEED_APPROVALS: ApprovalDto[] = [
  {
    id: "apr_0001",
    kind: "waste_adjustment",
    submitter: "Avi Cohen",
    submitter_role: "operator",
    created_at: "2026-04-14T10:20:00Z",
    summary: "Positive correction — White rum 37.5% +4 L (found_stock)",
    trigger_reason:
      "Policy: positive-direction adjustments always require planner approval.",
    payload_preview: {
      item: "White rum 37.5%",
      direction: "positive",
      quantity: "4 L",
      reason: "found_stock",
      notes: "Found sealed case behind cold room rack.",
    },
    status: "pending",
  },
  {
    id: "apr_0002",
    kind: "physical_count_variance",
    submitter: "Noa Peled",
    submitter_role: "operator",
    created_at: "2026-04-14T11:05:00Z",
    summary: "Count variance — Cane sugar counted 24.5 kg vs system 27.0 kg",
    trigger_reason: "Variance 2.5 kg (9.3%) exceeds 5% auto-post threshold.",
    payload_preview: {
      item: "Cane sugar",
      counted: "24.5 kg",
      system: "27.0 kg",
      variance_abs: "2.5 kg",
      variance_pct: "9.3%",
    },
    status: "pending",
  },
  {
    id: "apr_0003",
    kind: "waste_adjustment",
    submitter: "Avi Cohen",
    submitter_role: "operator",
    created_at: "2026-04-13T16:40:00Z",
    summary: "Loss — Silver tequila 38% −30 L (shrinkage)",
    trigger_reason:
      "Quantity 30 L exceeds large-adjustment threshold of 25 units.",
    payload_preview: {
      item: "Silver tequila 38%",
      direction: "loss",
      quantity: "30 L",
      reason: "shrinkage",
      notes: "Quarterly inventory reconciliation backfill.",
    },
    status: "pending",
  },
  {
    id: "apr_0004",
    kind: "forecast_publish",
    submitter: "Tom",
    submitter_role: "planner",
    created_at: "2026-04-14T08:55:00Z",
    summary: "Publish forecast draft v7 for 2026-W18 through 2026-W25",
    trigger_reason:
      "All forecast publishes route through a secondary planner review.",
    payload_preview: {
      version: "draft_v7",
      horizon_weeks: 8,
      changed_cells: 42,
      total_rows: 14,
    },
    status: "pending",
  },
];
