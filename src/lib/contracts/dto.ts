import type {
  AdjustmentDirection,
  AdjustmentReason,
  ApprovalKind,
  ExceptionSeverity,
  ItemKind,
  Role,
  SubmissionState,
  SupplyMethod,
  Uom,
  Urgency,
} from "./enums";

export interface AuditMeta {
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  version: number;
  active: boolean;
}

export interface ItemDto {
  id: string;
  sku: string;
  name: string;
  name_local?: string;
  kind: ItemKind;
  supply_method: SupplyMethod;
  default_uom: Uom;
  allowed_uoms: Uom[];
  min_stock?: number;
  reorder_point?: number;
  target_stock?: number;
  lead_time_days?: number;
  active_bom_id?: string;
  notes?: string;
  audit: AuditMeta;
}

export interface ComponentDto {
  id: string;
  code: string;
  name: string;
  name_local?: string;
  kind: "component" | "raw_material" | "packaging";
  default_uom: Uom;
  density_kg_per_l?: number;
  primary_supplier_id?: string;
  active_price?: { amount: number; currency: string; unit: Uom };
  lead_time_days?: number;
  notes?: string;
  audit: AuditMeta;
}

export interface BomLineDto {
  id: string;
  component_id: string;
  component_name: string;
  quantity_per: number;
  unit: Uom;
  scrap_factor: number;
  sort_order: number;
  notes?: string;
}

export interface BomVersionDto {
  id: string;
  bom_head_id: string;
  version_number: number;
  status: "draft" | "active" | "retired";
  effective_at?: string;
  lines: BomLineDto[];
  audit: AuditMeta;
}

export interface BomHeadDto {
  id: string;
  item_id: string;
  item_name: string;
  active_version_id?: string;
  versions: BomVersionDto[];
  audit: AuditMeta;
}

export interface SupplierDto {
  id: string;
  code: string;
  name: string;
  name_local?: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  currency: string;
  payment_terms?: string;
  lead_time_days?: number;
  notes?: string;
  audit: AuditMeta;
}

export interface SupplierItemDto {
  id: string;
  supplier_id: string;
  supplier_name: string;
  component_id: string;
  component_name: string;
  supplier_sku?: string;
  pack_size?: number;
  pack_unit?: Uom;
  active_price?: { amount: number; currency: string; unit: Uom };
  preferred: boolean;
  mapping_quality: "confirmed" | "probable" | "unmapped";
  audit: AuditMeta;
}

export interface PlanningPolicyDto {
  id: string;
  key: string;
  description: string;
  value: string | number | boolean;
  value_type: "number" | "string" | "boolean";
  scope: "global" | "item" | "supplier" | "reason";
  scope_ref?: string;
  audit: AuditMeta;
}

export interface UserDto {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  active: boolean;
  last_login_at?: string;
}

export interface GoodsReceiptLineDto {
  id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit: Uom;
  po_line_id?: string;
  notes?: string;
}

export interface GoodsReceiptDraftDto {
  idempotency_key: string;
  event_at: string;
  supplier_id?: string;
  supplier_name?: string;
  po_id?: string;
  po_number?: string;
  lines: GoodsReceiptLineDto[];
  notes?: string;
}

export interface WasteAdjustmentDraftDto {
  idempotency_key: string;
  event_at: string;
  direction: AdjustmentDirection;
  item_id?: string;
  item_name?: string;
  quantity: number;
  unit: Uom;
  reason_code?: AdjustmentReason;
  notes?: string;
}

export interface PhysicalCountDraftDto {
  idempotency_key: string;
  event_at: string;
  item_id?: string;
  item_name?: string;
  counted_quantity: number;
  unit: Uom;
  session_id?: string;
  notes?: string;
}

export interface SubmissionDto {
  id: string;
  form_type:
    | "goods_receipt"
    | "waste_adjustment"
    | "physical_count"
    | "production_actual"
    | "purchase_order";
  summary: string;
  state: SubmissionState;
  created_at: string;
  event_at: string;
  idempotency_key: string;
  payload_preview: Record<string, unknown>;
}

export interface ForecastCellDto {
  item_id: string;
  bucket: string;
  value: number;
}

export interface ForecastVersionDto {
  id: string;
  status: "draft" | "published" | "retired";
  version_number: number;
  horizon_weeks: number;
  bucket_granularity: "month" | "week";
  buckets: string[];
  rows: Array<{
    item_id: string;
    sku: string;
    name: string;
    family: string;
    cells: Record<string, number>;
  }>;
  audit: AuditMeta;
}

export interface PurchaseRecommendationDto {
  id: string;
  planning_run_id: string;
  supplier_id: string;
  supplier_name: string;
  component_id: string;
  component_name: string;
  recommended_quantity: number;
  unit: Uom;
  target_receive_date: string;
  urgency: Urgency;
  reason: string;
  on_hand: number;
  open_po_quantity: number;
  projected_stockout_at?: string;
  state: "pending" | "approved" | "rejected" | "held";
}

export interface ExceptionDto {
  id: string;
  source: string;
  severity: ExceptionSeverity;
  title: string;
  detail: string;
  created_at: string;
  status: "open" | "acknowledged" | "resolved";
  recommended_action?: string;
}

export interface ApprovalDto {
  id: string;
  kind: ApprovalKind;
  submitter: string;
  submitter_role: Role;
  created_at: string;
  summary: string;
  trigger_reason: string;
  payload_preview: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
}

export interface DashboardTileDto {
  stock_health: {
    total_items: number;
    in_shortage: number;
    in_overstock: number;
    healthy: number;
  };
  shortage_risk: Array<{
    item_id: string;
    item_name: string;
    days_to_stockout: number;
    on_hand: number;
    unit: Uom;
  }>;
  planning_run: {
    last_run_at: string;
    recommendation_count: number;
    flagged_count: number;
  };
  exceptions_summary: Record<ExceptionSeverity, number>;
  freshness: {
    ledger_last_post_at: string;
    lionwheel_last_sync_at: string;
    shopify_last_sync_at: string;
    greeninvoice_last_pull_at: string;
  };
  readiness: {
    ledger_integrity: "ok" | "warn" | "fail";
    projection_lag_seconds: number;
    jobs_health: "ok" | "warn" | "fail";
  };
}

export interface JobRunDto {
  id: string;
  job_id: string;
  job_name: string;
  schedule: string;
  last_run_at?: string;
  last_status: "ok" | "warn" | "fail" | "never_run";
  next_run_at?: string;
  last_error?: string;
  enabled: boolean;
}
