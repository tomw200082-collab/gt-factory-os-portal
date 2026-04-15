/**
 * Vitest global setup.
 *
 * We shim IndexedDB with `fake-indexeddb` so repository tests can
 * exercise the real GenericIdbRepo / IdbBomsRepo code paths against
 * an in-memory store. Each test file is free to call `resetFakeIDB()`
 * to get a clean slate if needed.
 */

import "fake-indexeddb/auto";

// Explicit hook for tests that want to wipe the fake DB between cases.
export async function resetFakeIDB(): Promise<void> {
  const { indexedDB } = globalThis as unknown as { indexedDB: IDBFactory };
  const dbs = await indexedDB.databases();
  for (const meta of dbs) {
    if (meta.name) {
      indexedDB.deleteDatabase(meta.name);
    }
  }
}

// Make crypto.randomUUID available (happy-dom provides it; guard for Node).
if (!globalThis.crypto || !globalThis.crypto.randomUUID) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { webcrypto } = require("node:crypto");
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as Crypto;
}
