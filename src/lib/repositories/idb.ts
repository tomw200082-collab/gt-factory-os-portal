"use client";

import { openDB, type IDBPDatabase } from "idb";

// ---------------------------------------------------------------------------
// IDB store setup — reconciled for Phase A.
//
// DB_VERSION bumped from 1 to 2. The upgrade path deletes and recreates
// all stores because:
//
//   - Per-store keyPaths changed to match the locked schema PKs
//     (item_id, component_id, supplier_id, supplier_item_id,
//      bom_head_id, bom_version_id, line_id, key).
//
//   - Two new stores were added: bom_versions, bom_lines (the locked
//     three-table BOM model separates these from bom_head).
//
//   - The canonical portal is pre-production; no user has persistent
//     operational data in this IDB yet. Clearing and re-seeding is safe
//     and is cheaper than migrating rows between shapes that do not
//     share a schema.
//
// If this code ships to production before Tranche 3 and someone has
// operational data locally, bump DB_VERSION again and write a real
// migration. Do not attempt in-place reshape here.
// ---------------------------------------------------------------------------

export const DB_NAME = "gt-factory-os-portal";
export const DB_VERSION = 2;

export const STORES = {
  items: "items",
  components: "components",
  suppliers: "suppliers",
  supplierItems: "supplier_items",
  boms: "boms",
  bomVersions: "bom_versions",
  bomLines: "bom_lines",
  planningPolicy: "planning_policy",
  users: "users",
  submissions: "submissions",
  meta: "meta",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

// ---------------------------------------------------------------------------
// Per-store keyPaths — each one matches the PK name in the locked SQL
// schema. Stores for DTOs that do not carry an audit envelope or do not
// map to a Tranche-1 master table (users, submissions, meta) keep a
// synthetic `id` keyPath for now.
// ---------------------------------------------------------------------------
const KEY_PATHS: Record<StoreName, string> = {
  [STORES.items]: "item_id",
  [STORES.components]: "component_id",
  [STORES.suppliers]: "supplier_id",
  [STORES.supplierItems]: "supplier_item_id",
  [STORES.boms]: "bom_head_id",
  [STORES.bomVersions]: "bom_version_id",
  [STORES.bomLines]: "line_id",
  [STORES.planningPolicy]: "key",
  [STORES.users]: "id",
  [STORES.submissions]: "id",
  [STORES.meta]: "id",
};

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("IndexedDB is only available in the browser"),
    );
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Phase A reconciliation: if coming from v1 (pre-Phase-A), wipe
        // every existing store so they can be recreated with the new
        // per-store keyPaths and the new three-table BOM model. No
        // in-place migration — see header comment.
        if (oldVersion < 2) {
          for (const existing of Array.from(db.objectStoreNames)) {
            db.deleteObjectStore(existing);
          }
        }
        for (const [storeName, keyPath] of Object.entries(KEY_PATHS) as Array<
          [StoreName, string]
        >) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath });
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function resetDb(): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await getDb();
  for (const store of Object.values(STORES)) {
    const tx = db.transaction(store, "readwrite");
    await tx.store.clear();
    await tx.done;
  }
  const metaTx = db.transaction(STORES.meta, "readwrite");
  await metaTx.store.put({ id: "seed_flag", seeded: false });
  await metaTx.done;
}
