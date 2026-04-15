import type { ExceptionDto } from "@/lib/contracts/dto";

export const SEED_EXCEPTIONS: ExceptionDto[] = [
  {
    id: "exc_0001",
    source: "integration.lionwheel",
    severity: "warning",
    title: "LionWheel sync stale",
    detail:
      "Last successful LionWheel order pull was 2h 12m ago. Threshold is 30 minutes.",
    created_at: "2026-04-14T11:00:00Z",
    status: "open",
    recommended_action: "Check LionWheel API credentials and re-run sync job.",
  },
  {
    id: "exc_0002",
    source: "price.greeninvoice",
    severity: "warning",
    title: "Price change above threshold — Cane sugar",
    detail:
      "Sugat Industries invoiced cane sugar at 4.85 ILS/kg (+15.5%). Auto-update suppressed; held for review.",
    created_at: "2026-04-14T08:42:00Z",
    status: "open",
    recommended_action:
      "Review invoice SUG-INV-90210 and accept or override the new price.",
  },
  {
    id: "exc_0003",
    source: "ledger.integrity",
    severity: "critical",
    title: "Projection mismatch — Fresh lime juice",
    detail:
      "Projected quantity (62.4 L) disagrees with rebuilt-from-ledger balance (61.2 L) by 1.2 L.",
    created_at: "2026-04-14T06:30:00Z",
    status: "acknowledged",
    recommended_action:
      "Run projection verification job and inspect recent postings for Fresh lime juice.",
  },
  {
    id: "exc_0004",
    source: "form.duplicate",
    severity: "info",
    title: "Duplicate receipt idempotency key",
    detail:
      "Goods Receipt submission idem_rcp_0001 was replayed 3 times within 5 minutes. Server dedup held.",
    created_at: "2026-04-14T09:18:00Z",
    status: "resolved",
  },
  {
    id: "exc_0005",
    source: "job.scheduled",
    severity: "warning",
    title: "Nightly export job partial failure",
    detail:
      "Excel values-only export completed with 2 of 14 sheets failing (stock_projection, exceptions_log).",
    created_at: "2026-04-14T02:01:00Z",
    status: "open",
    recommended_action: "Inspect job logs and rerun export for failed sheets.",
  },
  {
    id: "exc_0006",
    source: "planning.demand",
    severity: "info",
    title: "Forecast demand gap — Green smoothie",
    detail:
      "Forecast draft v4 has 0 for week 2026-W18 but open orders show 45 units. Gap will not be caught by rec engine.",
    created_at: "2026-04-13T16:11:00Z",
    status: "open",
    recommended_action:
      "Open the forecast workspace and reconcile Green smoothie 330ml for week 2026-W18.",
  },
];
