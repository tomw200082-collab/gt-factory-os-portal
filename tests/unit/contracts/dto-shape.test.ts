import { describe, expect, it } from "vitest";
import type {
  BomHeadDto,
  BomLineDto,
  BomVersionDto,
  ComponentDto,
  ItemDto,
  PlanningPolicyDto,
  SupplierDto,
  SupplierItemDto,
} from "@/lib/contracts/dto";

// ---------------------------------------------------------------------------
// T2 — DTO shape smoke test.
//
// Phase A brief §6 T2 regression anchor.
//
// Declares sample object literals typed as each reconciled DTO. If any
// required field is removed from a DTO, or if its type changes in a
// structurally incompatible way, this file stops compiling. That makes
// it a zero-runtime-cost sentinel for DTO-shape drift.
//
// The sample rows do not need to be "realistic" — they just need to
// satisfy the type. We still use values that match the locked schema
// (text PKs, uppercase UOMs, MANUFACTURED supply method, DRAFT status,
// etc.) so drift in a runtime interpretation also surfaces.
//
// This file has no assertions beyond the fact that it compiles. It
// exists for `tsc --noEmit` — which is already the Phase A typecheck
// gate — plus a dummy Vitest `expect` so the test runner discovers it
// and shows it in the pass count.
// ---------------------------------------------------------------------------

const SAMPLE_ITEM: ItemDto = {
  item_id: "FG-SAMPLE",
  item_name: "Sample item",
  family: null,
  pack_size: null,
  sales_uom: "BOTTLE",
  sweetness: null,
  supply_method: "MANUFACTURED",
  item_type: null,
  status: "ACTIVE",
  barcode: null,
  legacy_sku: null,
  shelf_life_days: null,
  storage: null,
  case_pack: null,
  primary_bom_head_id: null,
  base_bom_head_id: null,
  base_fill_qty_per_unit: null,
  sub_type: null,
  product_group: null,
  notes: null,
  site_id: "GT-MAIN",
  audit: {
    created_at: "2026-04-15T00:00:00Z",
    created_by: "test",
    updated_at: "2026-04-15T00:00:00Z",
    updated_by: "test",
    version: 1,
    active: true,
  },
};

const SAMPLE_COMPONENT: ComponentDto = {
  component_id: "RAW-SAMPLE",
  component_name: "Sample component",
  component_class: null,
  component_group: null,
  status: "ACTIVE",
  inventory_uom: "KG",
  purchase_uom: "KG",
  bom_uom: "KG",
  purchase_to_inv_factor: 1,
  planning_policy_code: null,
  primary_supplier_id: null,
  lead_time_days: null,
  moq_purchase_uom: null,
  order_multiple_purchase_uom: null,
  std_cost_per_purchase_uom: null,
  std_cost_per_inv_uom: null,
  criticality: null,
  planned_flag: true,
  notes: null,
  site_id: "GT-MAIN",
  audit: SAMPLE_ITEM.audit,
};

const SAMPLE_SUPPLIER: SupplierDto = {
  supplier_id: "SUP-SAMPLE",
  supplier_name_official: "Sample supplier",
  supplier_name_short: null,
  status: "ACTIVE",
  supplier_type: null,
  primary_contact_name: null,
  primary_contact_phone: null,
  currency: "ILS",
  payment_terms: null,
  default_lead_time_days: null,
  default_moq: null,
  approval_status: null,
  notes: null,
  site_id: "GT-MAIN",
  audit: SAMPLE_ITEM.audit,
};

const SAMPLE_SUPPLIER_ITEM: SupplierItemDto = {
  supplier_item_id: "si-sample",
  supplier_id: "SUP-SAMPLE",
  // Polymorphic XOR: exactly one of component_id / item_id is set.
  component_id: "RAW-SAMPLE",
  item_id: null,
  relationship: null,
  is_primary: true,
  order_uom: "KG",
  inventory_uom: "KG",
  pack_conversion: 1,
  lead_time_days: null,
  moq: null,
  payment_terms: null,
  safety_days: 0,
  approval_status: null,
  source_basis: null,
  notes: null,
  site_id: "GT-MAIN",
  audit: SAMPLE_ITEM.audit,
};

const SAMPLE_BOM_HEAD: BomHeadDto = {
  bom_head_id: "BOM-SAMPLE",
  bom_kind: "BASE",
  display_family: null,
  sweetness: null,
  pack_size: null,
  parent_ref_type: null,
  parent_ref_id: null,
  parent_name: null,
  linked_base_bom_head_id: null,
  final_bom_output_qty: 492,
  final_bom_output_uom: "L",
  active_version_id: null,
  status: "ACTIVE",
  review_flag: null,
  owner_notes: null,
  site_id: "GT-MAIN",
  audit: SAMPLE_ITEM.audit,
};

const SAMPLE_BOM_VERSION: BomVersionDto = {
  bom_version_id: "bv-sample",
  bom_head_id: "BOM-SAMPLE",
  version_label: "V1_SAMPLE",
  status: "DRAFT",
  created_by_user_id: null,
  created_at: "2026-04-15T00:00:00Z",
  activated_at: null,
  archived_at: null,
  content_hash: null,
  min_run_l: null,
  buffer_pct: null,
  source_basis: null,
  notes: null,
  site_id: "GT-MAIN",
};

const SAMPLE_BOM_LINE: BomLineDto = {
  line_id: "line-sample",
  bom_version_id: "bv-sample",
  bom_head_id: "BOM-SAMPLE",
  line_no: 1,
  bom_kind: "BASE",
  component_ref_type: "COMPONENT",
  final_component_id: "RAW-SAMPLE",
  final_component_name: "Sample",
  final_component_qty: 100,
  component_uom: "L",
  status: "ACTIVE",
  scaling_method: "RATIO",
  qty_per_l_output: null,
  std_cost_per_uom: null,
  line_std_cost: null,
  notes: null,
  site_id: "GT-MAIN",
};

const SAMPLE_PLANNING_POLICY: PlanningPolicyDto = {
  // Note: no id, no audit envelope. Flat K/V per locked schema.
  key: "sample.key",
  value: "10",
  uom: null,
  description: null,
  updated_at: "2026-04-15T00:00:00Z",
};

describe("contracts/dto shape smoke test", () => {
  it("all master DTOs compile against the locked schema shapes", () => {
    // If this file stops compiling, the drift is real. The test
    // body itself is trivial — the value is in the type checking
    // of the const declarations above.
    expect(SAMPLE_ITEM.item_id).toBe("FG-SAMPLE");
    expect(SAMPLE_COMPONENT.component_id).toBe("RAW-SAMPLE");
    expect(SAMPLE_SUPPLIER.supplier_id).toBe("SUP-SAMPLE");
    expect(SAMPLE_SUPPLIER_ITEM.supplier_item_id).toBe("si-sample");
    expect(SAMPLE_BOM_HEAD.bom_head_id).toBe("BOM-SAMPLE");
    expect(SAMPLE_BOM_VERSION.bom_version_id).toBe("bv-sample");
    expect(SAMPLE_BOM_LINE.line_id).toBe("line-sample");
    expect(SAMPLE_PLANNING_POLICY.key).toBe("sample.key");
  });

  it("SupplierItemDto XOR: component-targeted sample has item_id null", () => {
    expect(SAMPLE_SUPPLIER_ITEM.component_id).not.toBeNull();
    expect(SAMPLE_SUPPLIER_ITEM.item_id).toBeNull();
  });

  it("PlanningPolicyDto has no id and no audit (narrower DTO)", () => {
    // This test would compile-fail on the line above if
    // PlanningPolicyDto still carried id/audit.
    expect("id" in SAMPLE_PLANNING_POLICY).toBe(false);
    expect("audit" in SAMPLE_PLANNING_POLICY).toBe(false);
  });
});
