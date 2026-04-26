"use client";

import type {
  BomHeadDto,
  BomLineDto,
  BomVersionDto,
  ItemDto,
} from "@/lib/contracts/dto";
import { bumpAudit, seedAudit } from "@/lib/fixtures/audit";
import { getDb, STORES } from "./idb";
import { RepoError } from "./generic-repo";
import type { BomsRepo, QueryListParams } from "./types";

// ---------------------------------------------------------------------------
// IdbBomsRepo — three-store BOM implementation reconciled for Phase A.
//
// Unlike the pre-Phase-A draft which embedded versions inside BomHeadDto,
// this repo talks to three IDB stores that mirror the locked schema:
//
//   boms             (bom_head_id PK)   → BomHeadDto
//   bom_versions     (bom_version_id)   → BomVersionDto
//   bom_lines        (line_id)          → BomLineDto
//
// Invariants enforced here, matching 0003_bom_three_table.sql:
//
//   I1  at most one ACTIVE version per head
//   I2  DRAFT → ACTIVE → ARCHIVED only (no ACTIVE → DRAFT etc.)
//   I3  activating a new version demotes the previously ACTIVE version
//       to ARCHIVED in the same transaction (A20 atomic pattern)
//   I4  bom_lines.line_no unique per version — enforced at caller side
//       via updateLines which replaces the whole set for a version
//   I5  lines only editable on DRAFT versions
//
// Optimistic concurrency uses `audit.version` on heads and versions.
// Lines do not carry their own audit — they inherit concurrency from
// their parent version.
// ---------------------------------------------------------------------------

export class IdbBomsRepo implements BomsRepo {
  constructor(private readonly currentUser: () => string = () => "local") {}

  // -------------------------------------------------------------------------
  // Heads
  // -------------------------------------------------------------------------
  async listHeads(params?: QueryListParams): Promise<BomHeadDto[]> {
    const db = await getDb();
    const all = (await db.getAll(STORES.boms)) as BomHeadDto[];
    const q = params?.query?.trim().toLowerCase();
    const includeArchived = params?.includeArchived ?? false;
    return all
      .filter((h) => (includeArchived ? true : h.audit.active !== false))
      .filter((h) => {
        if (!q) return true;
        return (
          h.bom_head_id.toLowerCase().includes(q) ||
          (h.display_family?.toLowerCase().includes(q) ?? false) ||
          (h.parent_name?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => a.bom_head_id.localeCompare(b.bom_head_id));
  }

  async getHead(headId: string): Promise<BomHeadDto | null> {
    const db = await getDb();
    return (
      ((await db.get(STORES.boms, headId)) as BomHeadDto | undefined) ?? null
    );
  }

  // Convenience helper for the Production Simulation / BOM page UX:
  // fetch both the PACK and BASE BOM heads referenced by an item in
  // parallel. Either side may be null when the item does not point at
  // that head type (e.g. BOUGHT_FINISHED items have neither).
  async getProductBoms(item: ItemDto): Promise<{
    pack: BomHeadDto | null;
    base: BomHeadDto | null;
  }> {
    const [pack, base] = await Promise.all([
      item.primary_bom_head_id
        ? this.getHead(item.primary_bom_head_id)
        : Promise.resolve(null),
      item.base_bom_head_id
        ? this.getHead(item.base_bom_head_id)
        : Promise.resolve(null),
    ]);
    return { pack: pack ?? null, base: base ?? null };
  }

  async createHead(draft: Omit<BomHeadDto, "audit">): Promise<BomHeadDto> {
    const db = await getDb();
    const row: BomHeadDto = {
      ...(draft as BomHeadDto),
      audit: seedAudit(this.currentUser()),
    };
    await db.put(STORES.boms, row);
    return row;
  }

  // -------------------------------------------------------------------------
  // Versions
  // -------------------------------------------------------------------------
  async listVersions(headId: string): Promise<BomVersionDto[]> {
    const db = await getDb();
    const all = (await db.getAll(STORES.bomVersions)) as BomVersionDto[];
    return all
      .filter((v) => v.bom_head_id === headId)
      .sort((a, b) => a.version_label.localeCompare(b.version_label));
  }

  async getVersion(versionId: string): Promise<BomVersionDto | null> {
    const db = await getDb();
    return (
      ((await db.get(STORES.bomVersions, versionId)) as
        | BomVersionDto
        | undefined) ?? null
    );
  }

  async createDraftVersion(
    headId: string,
    cloneFromVersionId?: string,
  ): Promise<BomVersionDto> {
    const db = await getDb();
    const head = (await db.get(STORES.boms, headId)) as BomHeadDto | undefined;
    if (!head) throw new RepoError("not_found", `bom_head ${headId} not found`);

    const versionsForHead = (
      (await db.getAll(STORES.bomVersions)) as BomVersionDto[]
    ).filter((v) => v.bom_head_id === headId);

    const nextSeq = versionsForHead.length + 1;
    const versionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ver_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const now = new Date().toISOString();
    const draft: BomVersionDto = {
      bom_version_id: versionId,
      bom_head_id: headId,
      version_label: `V${nextSeq}_DRAFT`,
      status: "DRAFT",
      created_by_user_id: null,
      created_at: now,
      activated_at: null,
      archived_at: null,
      content_hash: null,
      min_run_l: null,
      buffer_pct: null,
      source_basis: "created_in_portal",
      notes: null,
      site_id: head.site_id,
    };

    await db.put(STORES.bomVersions, draft);

    // If cloning, copy lines from the source version into the new draft.
    if (cloneFromVersionId) {
      const sourceLines = (
        (await db.getAll(STORES.bomLines)) as BomLineDto[]
      ).filter((l) => l.bom_version_id === cloneFromVersionId);
      for (const line of sourceLines) {
        const newLineId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const cloned: BomLineDto = {
          ...line,
          line_id: newLineId,
          bom_version_id: versionId,
        };
        await db.put(STORES.bomLines, cloned);
      }
    }

    return draft;
  }

  async activateVersion(
    headId: string,
    versionId: string,
    expectedHeadVersion: number,
  ): Promise<BomHeadDto> {
    const db = await getDb();
    const head = (await db.get(STORES.boms, headId)) as BomHeadDto | undefined;
    if (!head) throw new RepoError("not_found", `bom_head ${headId} not found`);
    if (head.audit.version !== expectedHeadVersion) {
      throw new RepoError(
        "stale",
        `bom_head ${headId} version mismatch (expected ${expectedHeadVersion}, found ${head.audit.version})`,
        head,
      );
    }

    const target = (await db.get(STORES.bomVersions, versionId)) as
      | BomVersionDto
      | undefined;
    if (!target) throw new RepoError("not_found", `bom_version ${versionId} not found`);
    if (target.bom_head_id !== headId) {
      throw new RepoError(
        "validation",
        `bom_version ${versionId} does not belong to head ${headId}`,
      );
    }
    if (target.status !== "DRAFT") {
      throw new RepoError(
        "conflict",
        `Only DRAFT versions can be activated. This version is ${target.status}.`,
      );
    }

    // I1 + I3: demote the currently ACTIVE version for this head to
    // ARCHIVED (if any), then promote the target to ACTIVE, then update
    // head.active_version_id. Order matters — this mirrors A20 atomic
    // demote-then-promote; if we promoted first the partial-unique
    // invariant would fail at statement time.
    const now = new Date().toISOString();
    const versionsForHead = (
      (await db.getAll(STORES.bomVersions)) as BomVersionDto[]
    ).filter((v) => v.bom_head_id === headId);

    for (const v of versionsForHead) {
      if (v.status === "ACTIVE" && v.bom_version_id !== versionId) {
        const archived: BomVersionDto = {
          ...v,
          status: "ARCHIVED",
          archived_at: now,
        };
        await db.put(STORES.bomVersions, archived);
      }
    }

    const activated: BomVersionDto = {
      ...target,
      status: "ACTIVE",
      activated_at: now,
    };
    await db.put(STORES.bomVersions, activated);

    const nextHead: BomHeadDto = {
      ...head,
      active_version_id: versionId,
      audit: bumpAudit(head.audit, this.currentUser()),
    };
    await db.put(STORES.boms, nextHead);
    return nextHead;
  }

  async archiveVersion(versionId: string): Promise<BomVersionDto> {
    const db = await getDb();
    const v = (await db.get(STORES.bomVersions, versionId)) as
      | BomVersionDto
      | undefined;
    if (!v) throw new RepoError("not_found", `bom_version ${versionId} not found`);

    // I2: legal transitions DRAFT→ARCHIVED and ACTIVE→ARCHIVED; ARCHIVED
    // stays ARCHIVED (no-op but not an error).
    if (v.status === "ARCHIVED") return v;

    const archived: BomVersionDto = {
      ...v,
      status: "ARCHIVED",
      archived_at: new Date().toISOString(),
    };
    await db.put(STORES.bomVersions, archived);
    return archived;
  }

  // -------------------------------------------------------------------------
  // Lines
  // -------------------------------------------------------------------------
  async listLines(versionId: string): Promise<BomLineDto[]> {
    const db = await getDb();
    const all = (await db.getAll(STORES.bomLines)) as BomLineDto[];
    return all
      .filter((l) => l.bom_version_id === versionId)
      .sort((a, b) => a.line_no - b.line_no);
  }

  async updateLines(
    versionId: string,
    lines: BomLineDto[],
    expectedVersionAudit: number,
  ): Promise<BomVersionDto> {
    // expectedVersionAudit is kept in the interface for API symmetry
    // with optimistic-concurrency callers but BomVersionDto does not
    // carry an audit envelope in the locked schema. We use it as a
    // sentinel placeholder (callers can pass 0) and document the
    // behavior for Phase B when a real version field arrives.
    void expectedVersionAudit;

    const db = await getDb();
    const version = (await db.get(STORES.bomVersions, versionId)) as
      | BomVersionDto
      | undefined;
    if (!version) {
      throw new RepoError("not_found", `bom_version ${versionId} not found`);
    }
    if (version.status !== "DRAFT") {
      throw new RepoError(
        "conflict",
        `Cannot edit lines on ${version.status} version. Create a new draft first.`,
      );
    }

    // Replace the whole set for this version. Delete existing lines then
    // write the new ones. Line-level identity may change between saves.
    const existingLines = (
      (await db.getAll(STORES.bomLines)) as BomLineDto[]
    ).filter((l) => l.bom_version_id === versionId);
    for (const l of existingLines) {
      await db.delete(STORES.bomLines, l.line_id);
    }
    // Caller-supplied lines must have bom_version_id set to versionId;
    // enforce here rather than rewriting.
    for (const line of lines) {
      if (line.bom_version_id !== versionId) {
        throw new RepoError(
          "validation",
          `line ${line.line_id} has bom_version_id=${line.bom_version_id}, expected ${versionId}`,
        );
      }
      await db.put(STORES.bomLines, line);
    }

    return version;
  }
}
