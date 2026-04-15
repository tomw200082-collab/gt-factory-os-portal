import { beforeEach, describe, expect, it } from "vitest";
import { IdbBomsRepo } from "@/lib/repositories/boms-repo";
import { RepoError } from "@/lib/repositories/generic-repo";
import { getDb, STORES } from "@/lib/repositories/idb";
import { SEED_BOMS } from "@/lib/fixtures/boms";
import type { BomHeadDto, BomLineDto } from "@/lib/contracts/dto";
import { resetFakeIDB } from "../../setup-vitest";

const MOJITO_BOM_ID = "bom_mojito_450";

async function seedMojitoBom(): Promise<BomHeadDto> {
  const db = await getDb();
  const bom = structuredClone(SEED_BOMS.find((b) => b.id === MOJITO_BOM_ID)!);
  await db.put(STORES.boms, bom);
  return bom;
}

function repo() {
  return new IdbBomsRepo(() => "test-user");
}

describe("IdbBomsRepo — draft-only edit rule", () => {
  beforeEach(async () => {
    await resetFakeIDB();
  });

  it("rejects line edits on an active (non-draft) version", async () => {
    const bom = await seedMojitoBom();
    const activeVersion = bom.versions.find((v) => v.status === "active")!;
    const r = repo();

    const newLines: BomLineDto[] = activeVersion.lines.map((l) => ({
      ...l,
      quantity_per: l.quantity_per * 2,
    }));

    await expect(
      r.updateLines(bom.id, activeVersion.id, newLines, bom.audit.version)
    ).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("allows line edits on a draft version", async () => {
    const bom = await seedMojitoBom();
    const r = repo();

    // Create a new draft first.
    const withDraft = await r.addVersion(bom.id, bom.audit.version);
    const draft = withDraft.versions[withDraft.versions.length - 1];
    expect(draft.status).toBe("draft");

    const newLines: BomLineDto[] = draft.lines.map((l, i) => ({
      ...l,
      quantity_per: l.quantity_per + 0.001 * (i + 1),
    }));

    const updated = await r.updateLines(
      bom.id,
      draft.id,
      newLines,
      withDraft.audit.version
    );
    const updatedDraft = updated.versions.find((v) => v.id === draft.id)!;
    expect(updatedDraft.lines[0].quantity_per).toBeCloseTo(
      draft.lines[0].quantity_per + 0.001,
      5
    );
    expect(updatedDraft.status).toBe("draft");
  });

  it("rejects draft line edits when head version is stale", async () => {
    const bom = await seedMojitoBom();
    const r = repo();

    const withDraft = await r.addVersion(bom.id, bom.audit.version);
    const draft = withDraft.versions[withDraft.versions.length - 1];

    // Passing the pre-addVersion head version is stale.
    await expect(
      r.updateLines(bom.id, draft.id, draft.lines, bom.audit.version)
    ).rejects.toBeInstanceOf(RepoError);
  });
});

describe("IdbBomsRepo — activation retires prior active version", () => {
  beforeEach(async () => {
    await resetFakeIDB();
  });

  it("retires the currently active version and activates the target", async () => {
    const bom = await seedMojitoBom();
    const r = repo();

    const priorActive = bom.versions.find((v) => v.status === "active")!;

    // Add a draft v2 from latest.
    const withDraft = await r.addVersion(bom.id, bom.audit.version);
    const newDraft = withDraft.versions[withDraft.versions.length - 1];

    // Activate the new draft.
    const activated = await r.activateVersion(
      bom.id,
      newDraft.id,
      withDraft.audit.version
    );

    const newActive = activated.versions.find((v) => v.id === newDraft.id)!;
    const oldActive = activated.versions.find((v) => v.id === priorActive.id)!;

    expect(newActive.status).toBe("active");
    expect(newActive.effective_at).toBeDefined();
    expect(oldActive.status).toBe("retired");
    expect(activated.active_version_id).toBe(newDraft.id);
  });

  it("leaves historical retired versions untouched during activation", async () => {
    const db = await getDb();
    const bom = structuredClone(
      SEED_BOMS.find((b) => b.id === "bom_peach_tea_1l")!
    );
    await db.put(STORES.boms, bom);

    const r = repo();
    const v1 = bom.versions.find((v) => v.version_number === 1)!;
    expect(v1.status).toBe("retired");

    const withDraft = await r.addVersion(bom.id, bom.audit.version);
    const newDraft = withDraft.versions[withDraft.versions.length - 1];
    const activated = await r.activateVersion(
      bom.id,
      newDraft.id,
      withDraft.audit.version
    );

    const v1After = activated.versions.find((v) => v.id === v1.id)!;
    expect(v1After.status).toBe("retired");
  });

  it("emits RepoError('stale') when head version is wrong at activation time", async () => {
    const bom = await seedMojitoBom();
    const r = repo();

    const withDraft = await r.addVersion(bom.id, bom.audit.version);
    const newDraft = withDraft.versions[withDraft.versions.length - 1];

    // Pass the pre-addVersion head version = stale.
    await expect(
      r.activateVersion(bom.id, newDraft.id, bom.audit.version)
    ).rejects.toMatchObject({ code: "stale" });
  });
});
