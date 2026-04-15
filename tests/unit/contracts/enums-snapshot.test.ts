import { describe, expect, it } from "vitest";
import {
  BOM_HEAD_STATUSES,
  BOM_KINDS,
  BOM_VERSION_STATUSES,
  COMPONENT_REF_TYPES,
  COMPONENT_STATUSES,
  ITEM_STATUSES,
  SUPPLIER_STATUSES,
  SUPPLY_METHODS,
  UOMS,
} from "@/lib/contracts/enums";

// ---------------------------------------------------------------------------
// T1 — Enum snapshot test.
//
// Phase A brief §6 T1 regression anchor.
//
// Pins every reconciled enum array by exact value equality against the
// locked SQL schema. The canonical source of truth is:
//
//   gt-factory-os/db/migrations/0001_domains_and_schemas.sql  (uom seed)
//   gt-factory-os/db/migrations/0002_masters.sql              (CHECKs)
//   gt-factory-os/db/migrations/0003_bom_three_table.sql      (CHECKs)
//
// Any addition, removal, or reordering of enum members will fail this
// test. If the DB schema intentionally changes, update this file in
// the same PR. Drift between enums.ts and the migrations is a bug.
// ---------------------------------------------------------------------------

describe("contracts/enums — locked SQL schema snapshot", () => {
  it("SUPPLY_METHODS matches 0002_masters.sql items.supply_method CHECK", () => {
    // Exact order and values. Preserves the legacy enum per locked
    // decision 58 (no normalization to MAKE/BOUGHT, no REPACK -> FINAL).
    expect([...SUPPLY_METHODS]).toEqual([
      "MANUFACTURED",
      "BOUGHT_FINISHED",
      "REPACK",
    ]);
  });

  it("ITEM_STATUSES matches 0002_masters.sql items.status CHECK (includes PENDING)", () => {
    expect([...ITEM_STATUSES]).toEqual(["ACTIVE", "INACTIVE", "PENDING"]);
  });

  it("COMPONENT_STATUSES matches 0002_masters.sql components.status CHECK (includes PENDING)", () => {
    expect([...COMPONENT_STATUSES]).toEqual(["ACTIVE", "INACTIVE", "PENDING"]);
  });

  it("SUPPLIER_STATUSES matches 0002_masters.sql suppliers.status CHECK (NO PENDING)", () => {
    // Locked decision: suppliers are either ACTIVE or INACTIVE. No
    // half-onboarded state. This test is the pin — if someone adds
    // PENDING here without updating 0002_masters.sql, the suppliers
    // admin screen will silently allow a value the DB rejects.
    expect([...SUPPLIER_STATUSES]).toEqual(["ACTIVE", "INACTIVE"]);
  });

  it("UOMS matches the 0001_domains_and_schemas.sql uom seed", () => {
    // Full 13-code set from the uom seed INSERT statements.
    // BOTTLE and TIN are legitimate count UOMs used by
    // items.sales_uom in the current fixtures (29 BOTTLE rows,
    // 2 TIN rows).
    expect(new Set(UOMS)).toEqual(
      new Set([
        "KG",
        "L",
        "UNIT",
        "G",
        "MG",
        "TON",
        "ML",
        "PCS",
        "BAG",
        "CASE",
        "BOX",
        "BOTTLE",
        "TIN",
      ]),
    );
    // Also assert the full set has exactly 13 distinct members — no
    // duplicates, no accidental lowercase leakage.
    expect(UOMS.length).toBe(13);
    expect(new Set(UOMS).size).toBe(13);
  });

  it("BOM_KINDS matches 0003_bom_three_table.sql bom_head.bom_kind CHECK (NOT plan-draft FINAL)", () => {
    // Fixture reality wins: the workbook uses REPACK, not FINAL.
    // This is the exact reason the Phase A brief §6 T1 regression
    // test exists.
    expect([...BOM_KINDS]).toEqual(["BASE", "PACK", "REPACK"]);
  });

  it("BOM_VERSION_STATUSES matches 0003 state machine DRAFT -> ACTIVE -> ARCHIVED", () => {
    // No 'retired' (lowercase, and a terminal state that doesn't
    // exist in the locked schema).
    expect([...BOM_VERSION_STATUSES]).toEqual([
      "DRAFT",
      "ACTIVE",
      "ARCHIVED",
    ]);
  });

  it("BOM_HEAD_STATUSES matches 0003 bom_head.status CHECK", () => {
    // PENDING exists for REPACK heads whose configuration is still
    // open (e.g. BOM-REPACK-MAT-100G in the current fixture).
    expect([...BOM_HEAD_STATUSES]).toEqual([
      "ACTIVE",
      "INACTIVE",
      "PENDING",
      "ARCHIVED",
    ]);
  });

  it("COMPONENT_REF_TYPES matches 0003 bom_lines.component_ref_type CHECK", () => {
    // Workbook import provenance tags, preserved verbatim.
    expect([...COMPONENT_REF_TYPES]).toEqual([
      "RAW_NAME",
      "BASE_BOM",
      "COMPONENT",
      "BOM",
    ]);
  });
});
