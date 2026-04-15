"use client";

import { openDB, type IDBPDatabase } from "idb";

export const DB_NAME = "gt-factory-os-portal";
export const DB_VERSION = 1;

export const STORES = {
  items: "items",
  components: "components",
  suppliers: "suppliers",
  supplierItems: "supplier_items",
  boms: "boms",
  planningPolicy: "planning_policy",
  users: "users",
  submissions: "submissions",
  meta: "meta",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB is only available in the browser"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const store of Object.values(STORES)) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: "id" });
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
