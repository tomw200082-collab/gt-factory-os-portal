"use client";

import { openDB, type IDBPDatabase } from "idb";

// ---------------------------------------------------------------------------
// IDB store setup.
//
// Version history — always forward-only, never downgrade:
//
//   v1 → v2 (Phase A): keyPaths changed to locked schema PKs; added
//     bom_versions and bom_lines stores. Migration: full wipe + recreate
//     (pre-production, no user data at risk).
//
//   v2 → v3 (no-op version advance): DB_VERSION was temporarily set to 3
//     in an uncommitted dev session, advancing the browser's stored version
//     to 3. Rolling back the constant to 2 caused a VersionError on that
//     browser ("requested version (2) < existing version (3)"). Fix: advance
//     the constant to 3. No schema changes — stores and keyPaths are
//     identical to v2.
//
// Rule: never lower DB_VERSION. If adding stores or changing keyPaths,
// bump DB_VERSION and write a forward migration below.
// ---------------------------------------------------------------------------

export const DB_NAME = "gt-factory-os-portal";
export const DB_VERSION = 3;

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
        // v1 → v2: keyPaths and stores changed — wipe and recreate.
        if (oldVersion < 2) {
          for (const existing of Array.from(db.objectStoreNames)) {
            db.deleteObjectStore(existing);
          }
        }
        // v2 → v3: no schema changes; createObjectStore loop below is a no-op
        //   for browsers already at v2 (all stores exist).
        for (const [storeName, keyPath] of Object.entries(KEY_PATHS) as Array<
          [StoreName, string]
        >) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath });
          }
        }
      },
      blocked() {
        console.warn(
          "[IDB] upgrade blocked — another tab has this database open. Close other tabs and reload.",
        );
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

/**
 * Test-only hook: close the cached db handle and clear the cached
 * promise so the next getDb() call re-opens a fresh database. Used by
 * tests/setup-vitest.ts resetFakeIDB(). Must be called BEFORE
 * indexedDB.deleteDatabase so the delete is not blocked by an open
 * connection.
 */
export async function __resetDbPromiseForTests(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      // ignore — best effort close
    }
  }
  dbPromise = null;
}
