import type { PlanningPolicyDto } from "@/lib/contracts/dto";

// ---------------------------------------------------------------------------
// Fixture planning policies — reshaped for Phase A.
//
// Matches the locked PlanningPolicyDto shape from 0002_masters.sql:
// flat text key/value with nullable uom + description + updated_at.
// No synthetic id, no audit envelope, no value_type/scope discriminator.
// Values are always text strings at this layer — the admin screen is
// responsible for parsing them on read.
// ---------------------------------------------------------------------------

const now = "2026-04-15T00:00:00Z";

export const SEED_POLICIES: PlanningPolicyDto[] = [
  {
    key: "adjustment.auto_post.small_threshold",
    value: "5",
    uom: "qty",
    description:
      "Small waste/adjustment auto-posts up to this absolute quantity.",
    updated_at: now,
  },
  {
    key: "adjustment.approval.large_threshold",
    value: "25",
    uom: "qty",
    description:
      "Waste/adjustment at or above this quantity routes to planner approval.",
    updated_at: now,
  },
  {
    key: "adjustment.positive.always_approval",
    value: "true",
    uom: null,
    description:
      "When true, every positive-direction adjustment requires approval regardless of quantity.",
    updated_at: now,
  },
  {
    key: "count.variance.auto_post_pct",
    value: "5",
    uom: "percent",
    description:
      "Variance under this percent auto-posts; over this, routes to approval.",
    updated_at: now,
  },
  {
    key: "count.variance.auto_post_abs",
    value: "2",
    uom: "qty",
    description:
      "Absolute variance floor that always auto-posts regardless of percent.",
    updated_at: now,
  },
  {
    key: "receipt.backdate.warn_days",
    value: "14",
    uom: "days",
    description:
      "Receipt event_at more than this many days in the past triggers a UI warning.",
    updated_at: now,
  },
  {
    key: "forecast.horizon_weeks",
    value: "8",
    uom: "weeks",
    description: "Number of forward weeks the forecast workspace renders.",
    updated_at: now,
  },
  {
    key: "supplier.price.auto_update_change_pct",
    value: "10",
    uom: "percent",
    description:
      "Maximum percent price change allowed for Green Invoice auto-update; above this requires review.",
    updated_at: now,
  },
  {
    key: "purchase_recs.bulk_approve.confirm_count",
    value: "10",
    uom: "count",
    description:
      "Approving more than this many purchase recs at once triggers a confirm dialog.",
    updated_at: now,
  },
];
