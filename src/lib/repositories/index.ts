"use client";

import type {
  ComponentDto,
  ItemDto,
  PlanningPolicyDto,
  SupplierDto,
  SupplierItemDto,
} from "@/lib/contracts/dto";
import { GenericIdbRepo } from "./generic-repo";
import { IdbBomsRepo } from "./boms-repo";
export { usersRepo } from "./users-repo";
import { STORES, getDb } from "./idb";
import { SEED_ITEMS } from "@/lib/fixtures/items";
import { SEED_COMPONENTS } from "@/lib/fixtures/components";
import { SEED_SUPPLIERS, SEED_SUPPLIER_ITEMS } from "@/lib/fixtures/suppliers";
import { SEED_BOMS } from "@/lib/fixtures/boms";
import { SEED_POLICIES } from "@/lib/fixtures/planning-policy";
import { SEED_USERS } from "@/lib/fixtures/users";

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
      STORES.planningPolicy,
      STORES.users,
      STORES.meta,
    ],
    "readwrite"
  );
  for (const row of SEED_ITEMS) tx.objectStore(STORES.items).put(row);
  for (const row of SEED_COMPONENTS) tx.objectStore(STORES.components).put(row);
  for (const row of SEED_SUPPLIERS) tx.objectStore(STORES.suppliers).put(row);
  for (const row of SEED_SUPPLIER_ITEMS)
    tx.objectStore(STORES.supplierItems).put(row);
  for (const row of SEED_BOMS) tx.objectStore(STORES.boms).put(row);
  for (const row of SEED_POLICIES) tx.objectStore(STORES.planningPolicy).put(row);
  for (const row of SEED_USERS)
    tx.objectStore(STORES.users).put({ ...row });
  tx.objectStore(STORES.meta).put({ id: "seed_flag", seeded: true });
  await tx.done;
  seeded = true;
}

export const itemsRepo = new GenericIdbRepo<ItemDto>(STORES.items, [
  "name",
  "sku",
  "name_local",
]);

export const componentsRepo = new GenericIdbRepo<ComponentDto>(
  STORES.components,
  ["name", "code", "name_local"]
);

export const suppliersRepo = new GenericIdbRepo<SupplierDto>(STORES.suppliers, [
  "name",
  "code",
  "name_local",
  "contact_person",
]);

export const supplierItemsRepo = new GenericIdbRepo<SupplierItemDto>(
  STORES.supplierItems,
  ["component_name", "supplier_name", "supplier_sku"]
);

export const planningPolicyRepo = new GenericIdbRepo<PlanningPolicyDto>(
  STORES.planningPolicy,
  ["key", "description"]
);

export const bomsRepo = new IdbBomsRepo();
