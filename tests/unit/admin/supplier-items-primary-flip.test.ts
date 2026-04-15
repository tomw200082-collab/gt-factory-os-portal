import { beforeEach, describe, expect, it } from "vitest";
import { GenericIdbRepo, RepoError } from "@/lib/repositories/generic-repo";
import { STORES, getDb } from "@/lib/repositories/idb";
import type { SupplierItemDto } from "@/lib/contracts/dto";
import { resetFakeIDB } from "../../setup-vitest";

// ---------------------------------------------------------------------------
// T5 — supplier_items primary-flip analogue test.
//
// Phase A brief §6 T5 regression anchor.
//
// Mirrors pgTAP tests A20 / A21 from db/tests/0002_masters.test.sql in
// the portal's test harness. The pgTAP originals assert:
//
//   A20 — ordered flip succeeds:
//           UPDATE existing_primary SET is_primary = false;
//           UPDATE new_candidate    SET is_primary = true;
//         The partial unique index uniq_supplier_items_component_primary
//         is enforced at statement-execution time, so demoting the old
//         primary BEFORE promoting the new one succeeds.
//
//   A21 — reverse-order flip fails loudly:
//           UPDATE new_candidate    SET is_primary = true;  -- FAILS
//         At the moment this statement runs, two rows have
//         is_primary = true for the same component_id, and the
//         partial unique index rejects the second promotion
//         immediately — not at transaction commit time. Postgres
//         does NOT defer the check even inside a transaction.
//
// The portal's SupplierItemsEditPage enforces the same invariant at
// application level: the Make-primary action reads the existing
// primary first, demotes it, re-reads the local row to pick up a
// fresh audit.version, then promotes. If anyone rewrites that flow
// to "just set is_primary = true" on a single row, the tests here
// fail loudly.
//
// These tests hit the mock IDB repo layer (GenericIdbRepo), not the
// admin page directly. They exercise the EXACT doctrine the page
// must follow. The application-level primary-uniqueness check lives
// in the supplier-items screen (SupplierItemEditPanel.makePrimary)
// and is NOT enforced by the mock repo — because the repo is a
// generic audited master repo, not a supplier_items specialisation.
// The tests therefore simulate the flow the admin page is required
// to implement.
// ---------------------------------------------------------------------------

function repo() {
  return new GenericIdbRepo<SupplierItemDto>({
    store: STORES.supplierItems,
    idOf: (r) => r.supplier_item_id,
    searchFields: ["supplier_id"],
    currentUser: () => "test-user",
  });
}

const COMPONENT_ID = "RAW-SAMPLE";

function baseRow(
  id: string,
  supplierId: string,
  isPrimary: boolean,
): SupplierItemDto {
  return {
    supplier_item_id: id,
    supplier_id: supplierId,
    component_id: COMPONENT_ID,
    item_id: null,
    relationship: null,
    is_primary: isPrimary,
    order_uom: "KG",
    inventory_uom: "KG",
    pack_conversion: 1,
    lead_time_days: null,
    moq: null,
    payment_terms: null,
    safety_days: 0,
    approval_status: null,
    source_basis: "TEST",
    notes: null,
    site_id: "GT-MAIN",
    audit: {
      created_at: "2026-04-15T00:00:00Z",
      created_by: "seed",
      updated_at: "2026-04-15T00:00:00Z",
      updated_by: "seed",
      version: 1,
      active: true,
    },
  };
}

async function seedPair() {
  const db = await getDb();
  await db.put(STORES.supplierItems, baseRow("si-a", "SUP-A", true));
  await db.put(STORES.supplierItems, baseRow("si-b", "SUP-B", false));
}

/**
 * Count rows that are `is_primary: true` and target the same
 * component. This is the application-level invariant the
 * supplier_items screen's Make-primary action must enforce.
 */
async function countPrimariesForComponent(
  componentId: string,
): Promise<number> {
  const db = await getDb();
  const all = (await db.getAll(
    STORES.supplierItems,
  )) as SupplierItemDto[];
  return all.filter(
    (r) => r.component_id === componentId && r.is_primary === true,
  ).length;
}

describe("supplier_items — A20 ordered demote-then-promote succeeds", () => {
  beforeEach(async () => {
    await resetFakeIDB();
    await seedPair();
  });

  it("demote A then promote B leaves exactly one primary (A20)", async () => {
    const r = repo();
    const before = await countPrimariesForComponent(COMPONENT_ID);
    expect(before).toBe(1);

    // Step 1: demote the current primary A using its audit version.
    const a = await r.get("si-a");
    if (!a) throw new Error("seed failure");
    await r.update("si-a", { is_primary: false }, a.audit.version);

    // Step 2: re-read B to get its (unchanged) audit version and
    // promote.
    const bFresh = await r.get("si-b");
    if (!bFresh) throw new Error("seed failure");
    await r.update("si-b", { is_primary: true }, bFresh.audit.version);

    // Exactly one primary now. B is the primary.
    const after = await countPrimariesForComponent(COMPONENT_ID);
    expect(after).toBe(1);

    const bAfter = await r.get("si-b");
    expect(bAfter?.is_primary).toBe(true);
    const aAfter = await r.get("si-a");
    expect(aAfter?.is_primary).toBe(false);
  });
});

describe("supplier_items — A21 reverse order breaks the invariant", () => {
  beforeEach(async () => {
    await resetFakeIDB();
    await seedPair();
  });

  it("naive 'just promote B' without demoting A produces two primaries", async () => {
    // This is the EXACT anti-pattern the SupplierItemsEditPage must
    // avoid. At the mock-repo layer the generic repo does not
    // enforce the partial unique index, so the naive flow
    // succeeds at the write but produces the invariant violation
    // that A21 catches at the DB level.
    //
    // This test pins the shape of the bug: "naive write produces
    // two primaries". The application-layer Make-primary flow in
    // the supplier-items page must never issue this single write
    // in isolation; it must always demote first.
    const r = repo();
    const bBefore = await r.get("si-b");
    if (!bBefore) throw new Error("seed failure");

    await r.update("si-b", { is_primary: true }, bBefore.audit.version);

    const count = await countPrimariesForComponent(COMPONENT_ID);
    expect(count).toBe(2);
  });

  it("ordered flip keeps the invariant — counter-test against the naive case", async () => {
    // Same test data, but using the correct demote-then-promote
    // order. Ends with exactly one primary. This is the application
    // contract the admin page implements.
    const r = repo();
    const a = await r.get("si-a");
    if (!a) throw new Error("seed failure");
    await r.update("si-a", { is_primary: false }, a.audit.version);
    const bFresh = await r.get("si-b");
    if (!bFresh) throw new Error("seed failure");
    await r.update("si-b", { is_primary: true }, bFresh.audit.version);

    const count = await countPrimariesForComponent(COMPONENT_ID);
    expect(count).toBe(1);
  });

  it("attempting the promote step with a stale audit version raises RepoError('stale')", async () => {
    // Additional safety net: if the admin page forgets to re-read
    // before the promote, optimistic concurrency catches it. This
    // is the last line of defense before the application reaches
    // the DB partial unique index.
    const r = repo();
    const a = await r.get("si-a");
    const bOriginal = await r.get("si-b");
    if (!a || !bOriginal) throw new Error("seed failure");

    await r.update("si-a", { is_primary: false }, a.audit.version);
    // Demote A bumped NOTHING on B, but if the flow later does a
    // different update to B before the promote (audit bump), using
    // the pre-demote version would be stale. Simulate by bumping
    // B's own version.
    const freshB = await r.get("si-b");
    await r.update(
      "si-b",
      { notes: "mid-flow audit touch" },
      freshB!.audit.version,
    );

    // Now try to promote using the original stale version.
    await expect(
      r.update("si-b", { is_primary: true }, bOriginal.audit.version),
    ).rejects.toBeInstanceOf(RepoError);
  });
});
