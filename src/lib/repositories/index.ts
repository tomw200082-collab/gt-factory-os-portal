"use client";

import type {
  ComponentDto,
  ItemDto,
  PlanningPolicyDto,
  SupplierDto,
  SupplierItemDto,
} from "@/lib/contracts/dto";
import { GenericIdbRepo, KeyValueIdbRepo } from "./generic-repo";
import { IdbBomsRepo } from "./boms-repo";
export { usersRepo } from "./users-repo";
import { STORES, getDb } from "./idb";
import { SEED_ITEMS } from "@/lib/fixtures/items";
import { SEED_COMPONENTS } from "@/lib/fixtures/components";
import {
  SEED_SUPPLIERS,
  SEED_SUPPLIER_ITEMS,
} from "@/lib/fixtures/suppliers";
import {
  SEED_BOM_HEADS,
  SEED_BOM_VERSIONS,
  SEED_BOM_LINES,
} from "@/lib/fixtures/boms";
import { SEED_POLICIES } from "@/lib/fixtures/planning-policy";
import { SEED_USERS } from "@/lib/fixtures/users";

// ---------------------------------------------------------------------------
// Seed wiring — reconciled for Phase A.
//
// Adds the two new BOM stores (bom_versions, bom_lines) to the seed
// transaction. Fixtures must export three separate arrays now
// (SEED_BOM_HEADS, SEED_BOM_VERSIONS, SEED_BOM_LINES) matching the
// three-table schema.
// ---------------------------------------------------------------------------

let seeded = false;

export async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  const db = await getDb();
  const flag = (await db.get(STORES.meta, "seed_flag")) as
    | { id: string; seeded: boolean }
    | undefined;
  if (flag?.seeded) {
    seeded = true;
    return;
  }
  const tx = db.transaction(
    [
      STORES.items,
      STORES.components,
      STORES.suppliers,
      STORES.supplierItems,
      STORES.boms,
      STORES.bomVersions,
      STORES.bomLines,
      STORES.planningPolicy,
      STORES.users,
      STORES.meta,
    ],
    "readwrite",
  );
  for (const row of SEED_ITEMS) tx.objectStore(STORES.items).put(row);
  for (const row of SEED_COMPONENTS) tx.objectStore(STORES.components).put(row);
  for (const row of SEED_SUPPLIERS) tx.objectStore(STORES.suppliers).put(row);
  for (const row of SEED_SUPPLIER_ITEMS)
    tx.objectStore(STORES.supplierItems).put(row);
  for (const row of SEED_BOM_HEADS) tx.objectStore(STORES.boms).put(row);
  for (const row of SEED_BOM_VERSIONS)
    tx.objectStore(STORES.bomVersions).put(row);
  for (const row of SEED_BOM_LINES) tx.objectStore(STORES.bomLines).put(row);
  for (const row of SEED_POLICIES)
    tx.objectStore(STORES.planningPolicy).put(row);
  for (const row of SEED_USERS) tx.objectStore(STORES.users).put({ ...row });
  tx.objectStore(STORES.meta).put({ id: "seed_flag", seeded: true });
  await tx.done;
  seeded = true;
}

// ---------------------------------------------------------------------------
// Repo singletons — constructed with pluggable idOf extractors so the
// generic repo can target the locked schema's per-table PK column names.
//
// searchFields ordering matters: the first field is also the sort key
// used by list() (see generic-repo.ts). Put the display name first.
// ---------------------------------------------------------------------------

export const itemsRepo = new GenericIdbRepo<ItemDto>({
  store: STORES.items,
  idOf: (row) => row.item_id,
  searchFields: ["item_name", "family", "product_group", "legacy_sku"],
});

export const componentsRepo = new GenericIdbRepo<ComponentDto>({
  store: STORES.components,
  idOf: (row) => row.component_id,
  searchFields: ["component_name", "component_class", "component_group"],
});

export const suppliersRepo = new GenericIdbRepo<SupplierDto>({
  store: STORES.suppliers,
  idOf: (row) => row.supplier_id,
  searchFields: [
    "supplier_name_official",
    "supplier_name_short",
    "primary_contact_name",
  ],
});

export const supplierItemsRepo = new GenericIdbRepo<SupplierItemDto>({
  store: STORES.supplierItems,
  idOf: (row) => row.supplier_item_id,
  searchFields: ["supplier_id", "component_id", "item_id"],
});

// PlanningPolicyDto is intentionally narrower — flat text K/V, no audit
// envelope, no optimistic concurrency. This is the structural decision
// approved at Gate 1: a narrower repo, not a weakened audited generic.
export const planningPolicyRepo = new KeyValueIdbRepo<PlanningPolicyDto>({
  store: STORES.planningPolicy,
  keyOf: (row) => row.key,
  searchFields: ["key", "description", "value"],
});

export const bomsRepo = new IdbBomsRepo();
