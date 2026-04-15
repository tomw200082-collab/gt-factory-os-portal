import { beforeEach, describe, expect, it } from "vitest";
import { IdbBomsRepo } from "@/lib/repositories/boms-repo";
import { RepoError } from "@/lib/repositories/generic-repo";
import { getDb, STORES } from "@/lib/repositories/idb";
import {
  SEED_BOM_HEADS,
  SEED_BOM_VERSIONS,
  SEED_BOM_LINES,
} from "@/lib/fixtures/boms";
import type {
  BomHeadDto,
  BomLineDto,
  BomVersionDto,
} from "@/lib/contracts/dto";
import { resetFakeIDB } from "../../setup-vitest";

// ---------------------------------------------------------------------------
// BomsRepo tests — reconciled for Phase A three-table BOM model.
//
// The new IdbBomsRepo talks to three stores (boms, bom_versions,
// bom_lines) instead of embedding versions inside BomHeadDto. State
// machine is DRAFT -> ACTIVE -> ARCHIVED (not draft|active|retired).
// Activation enforces the atomic demote-then-promote invariant from
// pgTAP tests A20/A21 in db/tests/0002_masters.test.sql.
//
// The test fixtures use a MOJITO base BOM with a single ACTIVE version
// and a PEACH TEA base BOM with one ARCHIVED + one ACTIVE version so
// we can assert ARCHIVED-stays-put behavior during later activation.
// ---------------------------------------------------------------------------

const MOJITO_HEAD_ID = "BOM-BASE-MOJ-REG";
const MOJITO_ACTIVE_VERSION_ID = "bv-base-moj-reg-v1";
const PEACH_HEAD_ID = "BOM-BASE-TEA-PCH";
const PEACH_ACTIVE_VERSION_ID = "bv-base-tea-pch-v2";
const PEACH_ARCHIVED_VERSION_ID = "bv-base-tea-pch-v1";

async function seedBoms(): Promise<void> {
  const db = await getDb();
  for (const h of SEED_BOM_HEADS) {
    await db.put(STORES.boms, structuredClone(h));
  }
  for (const v of SEED_BOM_VERSIONS) {
    await db.put(STORES.bomVersions, structuredClone(v));
  }
  for (const l of SEED_BOM_LINES) {
    await db.put(STORES.bomLines, structuredClone(l));
  }
}

function repo() {
  return new IdbBomsRepo(() => "test-user");
}

describe("IdbBomsRepo — draft-only edit rule", () => {
  beforeEach(async () => {
    await resetFakeIDB();
    await seedBoms();
  });

  it("rejects line edits on an ACTIVE version", async () => {
    const r = repo();
    const active = (await r.getVersion(
      MOJITO_ACTIVE_VERSION_ID,
    )) as BomVersionDto;
    expect(active.status).toBe("ACTIVE");

    const lines = await r.listLines(MOJITO_ACTIVE_VERSION_ID);
    const doubled: BomLineDto[] = lines.map((l) => ({
      ...l,
      final_component_qty: (l.final_component_qty ?? 0) * 2,
    }));

    await expect(
      r.updateLines(MOJITO_ACTIVE_VERSION_ID, doubled, 0),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("allows line edits on a DRAFT version created via createDraftVersion", async () => {
    const r = repo();

    const draft = await r.createDraftVersion(
      MOJITO_HEAD_ID,
      MOJITO_ACTIVE_VERSION_ID,
    );
    expect(draft.status).toBe("DRAFT");
    expect(draft.bom_head_id).toBe(MOJITO_HEAD_ID);

    // Cloned lines should exist and belong to the new draft.
    const clonedLines = await r.listLines(draft.bom_version_id);
    expect(clonedLines.length).toBeGreaterThan(0);
    for (const l of clonedLines) {
      expect(l.bom_version_id).toBe(draft.bom_version_id);
    }

    // Edit the cloned lines in place.
    const nudged: BomLineDto[] = clonedLines.map((l, i) => ({
      ...l,
      final_component_qty: (l.final_component_qty ?? 0) + 0.001 * (i + 1),
    }));

    const updated = await r.updateLines(draft.bom_version_id, nudged, 0);
    expect(updated.status).toBe("DRAFT");

    const refetched = await r.listLines(draft.bom_version_id);
    expect(refetched[0].final_component_qty).toBeCloseTo(
      (clonedLines[0].final_component_qty ?? 0) + 0.001,
      5,
    );
  });

  it("updateLines rejects a line whose bom_version_id does not match", async () => {
    const r = repo();
    const draft = await r.createDraftVersion(MOJITO_HEAD_ID);
    const bogus: BomLineDto[] = [
      {
        line_id: "line-bogus",
        bom_version_id: "wrong-version",
        bom_head_id: MOJITO_HEAD_ID,
        line_no: 1,
        bom_kind: "BASE",
        component_ref_type: "COMPONENT",
        final_component_id: "RAW-RUM-WHITE",
        final_component_name: "White rum 37.5%",
        final_component_qty: 1,
        component_uom: "L",
        status: "ACTIVE",
        scaling_method: "RATIO",
        qty_per_l_output: null,
        std_cost_per_uom: null,
        line_std_cost: null,
        notes: null,
        site_id: "GT-MAIN",
      },
    ];
    await expect(
      r.updateLines(draft.bom_version_id, bogus, 0),
    ).rejects.toMatchObject({ code: "validation" });
  });
});

describe("IdbBomsRepo — activation atomic demote-then-promote (A20 pattern)", () => {
  beforeEach(async () => {
    await resetFakeIDB();
    await seedBoms();
  });

  it("archives the currently ACTIVE version and activates the target", async () => {
    const r = repo();
    const head = (await r.getHead(MOJITO_HEAD_ID)) as BomHeadDto;
    const priorActive = (await r.getVersion(
      MOJITO_ACTIVE_VERSION_ID,
    )) as BomVersionDto;
    expect(priorActive.status).toBe("ACTIVE");

    const draft = await r.createDraftVersion(
      MOJITO_HEAD_ID,
      MOJITO_ACTIVE_VERSION_ID,
    );
    const nextHead = await r.activateVersion(
      MOJITO_HEAD_ID,
      draft.bom_version_id,
      head.audit.version,
    );

    expect(nextHead.active_version_id).toBe(draft.bom_version_id);

    const newActive = (await r.getVersion(
      draft.bom_version_id,
    )) as BomVersionDto;
    const oldActive = (await r.getVersion(
      MOJITO_ACTIVE_VERSION_ID,
    )) as BomVersionDto;

    expect(newActive.status).toBe("ACTIVE");
    expect(newActive.activated_at).not.toBeNull();
    expect(oldActive.status).toBe("ARCHIVED");
    expect(oldActive.archived_at).not.toBeNull();
  });

  it("leaves historical ARCHIVED versions untouched during activation", async () => {
    const r = repo();
    const head = (await r.getHead(PEACH_HEAD_ID)) as BomHeadDto;

    const draft = await r.createDraftVersion(
      PEACH_HEAD_ID,
      PEACH_ACTIVE_VERSION_ID,
    );
    await r.activateVersion(
      PEACH_HEAD_ID,
      draft.bom_version_id,
      head.audit.version,
    );

    // The pre-existing ARCHIVED version should still be ARCHIVED,
    // untouched — ARCHIVED is a terminal state and activation of a
    // different draft must not reset its archived_at.
    const v1 = (await r.getVersion(
      PEACH_ARCHIVED_VERSION_ID,
    )) as BomVersionDto;
    expect(v1.status).toBe("ARCHIVED");
  });

  it("raises RepoError('stale') when head version is wrong at activation time", async () => {
    const r = repo();
    const head = (await r.getHead(MOJITO_HEAD_ID)) as BomHeadDto;
    const draft = await r.createDraftVersion(MOJITO_HEAD_ID);

    await expect(
      r.activateVersion(
        MOJITO_HEAD_ID,
        draft.bom_version_id,
        head.audit.version + 5,
      ),
    ).rejects.toMatchObject({ code: "stale" });
  });

  it("rejects activating a version whose head_id does not match", async () => {
    const r = repo();
    const mojitoHead = (await r.getHead(MOJITO_HEAD_ID)) as BomHeadDto;
    const peachDraft = await r.createDraftVersion(PEACH_HEAD_ID);

    // Try to activate a peach-tea draft against the mojito head.
    await expect(
      r.activateVersion(
        MOJITO_HEAD_ID,
        peachDraft.bom_version_id,
        mojitoHead.audit.version,
      ),
    ).rejects.toBeInstanceOf(RepoError);
  });

  it("rejects activating a non-DRAFT version", async () => {
    const r = repo();
    const head = (await r.getHead(MOJITO_HEAD_ID)) as BomHeadDto;
    // The mojito head's v1 is already ACTIVE. Attempting to activate it
    // again should fail because activation is for DRAFT transitions only.
    await expect(
      r.activateVersion(
        MOJITO_HEAD_ID,
        MOJITO_ACTIVE_VERSION_ID,
        head.audit.version,
      ),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("IdbBomsRepo — list/get/head create", () => {
  beforeEach(async () => {
    await resetFakeIDB();
    await seedBoms();
  });

  it("listHeads sorts by bom_head_id", async () => {
    const r = repo();
    const heads = await r.listHeads();
    expect(heads.length).toBeGreaterThan(0);
    const ids = heads.map((h) => h.bom_head_id);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it("listVersions filters to a specific head", async () => {
    const r = repo();
    const versions = await r.listVersions(PEACH_HEAD_ID);
    expect(versions.length).toBe(2);
    for (const v of versions) {
      expect(v.bom_head_id).toBe(PEACH_HEAD_ID);
    }
  });

  it("listLines filters to a specific version and sorts by line_no", async () => {
    const r = repo();
    const lines = await r.listLines(MOJITO_ACTIVE_VERSION_ID);
    expect(lines.length).toBeGreaterThan(0);
    const nums = lines.map((l) => l.line_no);
    const sorted = [...nums].sort((a, b) => a - b);
    expect(nums).toEqual(sorted);
  });
});
