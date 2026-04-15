import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GenericIdbRepo, RepoError } from "@/lib/repositories/generic-repo";
import { getDb, STORES } from "@/lib/repositories/idb";
import { SEED_ITEMS } from "@/lib/fixtures/items";
import type { ItemDto } from "@/lib/contracts/dto";
import { resetFakeIDB } from "../../setup-vitest";

// ---------------------------------------------------------------------------
// Generic repo tests — reconciled for Phase A.
//
// The canonical GenericIdbRepo now takes an options object with a
// pluggable idOf extractor (see generic-repo.ts) instead of relying on
// a synthetic `id` field. ItemDto uses `item_id` as its PK per the
// locked schema (0002_masters.sql). All assertions are updated to
// match.
// ---------------------------------------------------------------------------

function itemsRepoForTest() {
  return new GenericIdbRepo<ItemDto>({
    store: STORES.items,
    idOf: (row) => row.item_id,
    searchFields: ["item_name", "family"],
    currentUser: () => "test-user",
  });
}

async function seedOneItem(): Promise<ItemDto> {
  const db = await getDb();
  const row = structuredClone(SEED_ITEMS[0]);
  await db.put(STORES.items, row);
  return row;
}

describe("GenericIdbRepo — optimistic concurrency", () => {
  beforeEach(async () => {
    await resetFakeIDB();
  });

  afterEach(async () => {
    await resetFakeIDB();
  });

  it("updates a row when the expected version matches, bumping audit.version", async () => {
    const seeded = await seedOneItem();
    const repo = itemsRepoForTest();

    const updated = await repo.update(
      seeded.item_id,
      { item_name: "Renamed mojito" } as Partial<ItemDto>,
      seeded.audit.version,
    );

    expect(updated.item_name).toBe("Renamed mojito");
    expect(updated.audit.version).toBe(seeded.audit.version + 1);
    expect(updated.audit.updated_by).toBe("test-user");
  });

  it("rejects an update when the expected version is stale (RepoError 'stale')", async () => {
    const seeded = await seedOneItem();
    const repo = itemsRepoForTest();

    // First writer wins.
    await repo.update(
      seeded.item_id,
      { item_name: "First writer" } as Partial<ItemDto>,
      seeded.audit.version,
    );

    // Second writer holds the old version snapshot and tries to write.
    await expect(
      repo.update(
        seeded.item_id,
        { item_name: "Second writer" } as Partial<ItemDto>,
        seeded.audit.version,
      ),
    ).rejects.toBeInstanceOf(RepoError);

    const fresh = await repo.get(seeded.item_id);
    expect(fresh?.item_name).toBe("First writer");
  });

  it("carries the current row on RepoError('stale') so the caller can reconcile", async () => {
    const seeded = await seedOneItem();
    const repo = itemsRepoForTest();

    await repo.update(
      seeded.item_id,
      { item_name: "After v1" } as Partial<ItemDto>,
      seeded.audit.version,
    );

    try {
      await repo.update(
        seeded.item_id,
        { item_name: "Tries v1 again" } as Partial<ItemDto>,
        seeded.audit.version,
      );
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RepoError);
      const err = e as RepoError;
      expect(err.code).toBe("stale");
      const current = err.current as ItemDto;
      expect(current.item_name).toBe("After v1");
      expect(current.audit.version).toBe(seeded.audit.version + 1);
    }
  });

  it("rejects an update that tries to mutate the primary key", async () => {
    const seeded = await seedOneItem();
    const repo = itemsRepoForTest();

    // Runtime invariant: item_id is immutable. A patch that tries to
    // change it should be rejected with RepoError 'validation'.
    await expect(
      repo.update(
        seeded.item_id,
        { item_id: "FG-DIFFERENT" } as Partial<ItemDto>,
        seeded.audit.version,
      ),
    ).rejects.toMatchObject({ code: "validation" });
  });
});

describe("GenericIdbRepo — soft delete / archive", () => {
  beforeEach(async () => {
    await resetFakeIDB();
  });

  it("flips audit.active to false on setActive(id, false) and keeps the row", async () => {
    const seeded = await seedOneItem();
    const repo = itemsRepoForTest();

    const archived = await repo.setActive(seeded.item_id, false);
    expect(archived.audit.active).toBe(false);

    const fetched = await repo.get(seeded.item_id);
    expect(fetched).not.toBeNull();
    expect(fetched!.audit.active).toBe(false);
  });

  it("excludes archived rows from list() by default", async () => {
    const seeded = await seedOneItem();
    const repo = itemsRepoForTest();

    await repo.setActive(seeded.item_id, false);

    const visible = await repo.list();
    expect(visible.find((r) => r.item_id === seeded.item_id)).toBeUndefined();
  });

  it("includes archived rows when includeArchived is true", async () => {
    const seeded = await seedOneItem();
    const repo = itemsRepoForTest();
    await repo.setActive(seeded.item_id, false);

    const visible = await repo.list({ includeArchived: true });
    expect(visible.find((r) => r.item_id === seeded.item_id)).toBeDefined();
  });

  it("reactivates an archived row via setActive(id, true)", async () => {
    const seeded = await seedOneItem();
    const repo = itemsRepoForTest();
    await repo.setActive(seeded.item_id, false);

    const reactivated = await repo.setActive(seeded.item_id, true);
    expect(reactivated.audit.active).toBe(true);

    const visible = await repo.list();
    expect(visible.find((r) => r.item_id === seeded.item_id)).toBeDefined();
  });
});
