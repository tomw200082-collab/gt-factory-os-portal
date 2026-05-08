import { describe, expect, it, beforeEach } from "vitest";
import { DB_VERSION, DB_NAME, getDb } from "@/lib/repositories/idb";
import { resetFakeIDB } from "../../setup-vitest";

// ---------------------------------------------------------------------------
// Regression: DB_VERSION must never be lowered.
//
// The portal once had DB_VERSION = 2 while a browser already held version 3
// (created by an uncommitted dev session), producing:
//   "The requested version (2) is less than the existing version (3)."
// Bumping to 3 fixed it. This test locks the floor so a future accidental
// revert of the constant re-surfaces immediately.
// ---------------------------------------------------------------------------

describe("IDB version floor", () => {
  it("DB_VERSION is at least 3", () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(3);
  });

  it("DB_NAME is stable", () => {
    expect(DB_NAME).toBe("gt-factory-os-portal");
  });
});

describe("getDb() opens without VersionError", () => {
  beforeEach(async () => {
    await resetFakeIDB();
  });

  it("resolves on a fresh database", async () => {
    const db = await getDb();
    expect(db.version).toBe(DB_VERSION);
    db.close();
  });
});
