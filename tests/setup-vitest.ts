/**
 * Vitest global setup.
 *
 * We shim IndexedDB with `fake-indexeddb` so repository tests can
 * exercise the real GenericIdbRepo / IdbBomsRepo code paths against
 * an in-memory store. Each test file is free to call `resetFakeIDB()`
 * to get a clean slate if needed.
 */

import "fake-indexeddb/auto";
import { __resetDbPromiseForTests } from "@/lib/repositories/idb";

// Explicit hook for tests that want to wipe the fake DB between cases.
// Two steps:
//   1. Delete the underlying fake-indexeddb databases (awaited properly
//      this time — the deleteDatabase request is wrapped in a promise
//      so we block on its completion).
//   2. Clear the module-level cached dbPromise in idb.ts so the next
//      getDb() call re-opens the fresh database instead of reusing the
//      stale handle.
export async function resetFakeIDB(): Promise<void> {
  // Close the cached db handle first — otherwise deleteDatabase is
  // blocked by the open connection and the delete request never fires
  // onsuccess, which would hang the beforeEach hook.
  await __resetDbPromiseForTests();

  const { indexedDB } = globalThis as unknown as { indexedDB: IDBFactory };
  const dbs = await indexedDB.databases();
  await Promise.all(
    dbs
      .filter((m) => m.name)
      .map(
        (m) =>
          new Promise<void>((resolve, reject) => {
            const req = indexedDB.deleteDatabase(m.name!);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
            req.onblocked = () => resolve();
          }),
      ),
  );
}

// Make crypto.randomUUID available (happy-dom provides it; guard for Node).
if (!globalThis.crypto || !globalThis.crypto.randomUUID) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { webcrypto } = require("node:crypto");
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as Crypto;
}
