"use client";

import type { BomHeadDto, BomVersionDto } from "@/lib/contracts/dto";
import { bumpAudit, seedAudit } from "@/lib/fixtures/audit";
import { getDb, STORES } from "./idb";
import { RepoError } from "./generic-repo";
import type { BomsRepo, QueryListParams } from "./types";

export class IdbBomsRepo implements BomsRepo {
  constructor(private readonly currentUser: () => string = () => "local") {}

  async list(params?: QueryListParams): Promise<BomHeadDto[]> {
    const db = await getDb();
    const all = (await db.getAll(STORES.boms)) as BomHeadDto[];
    const q = params?.query?.trim().toLowerCase();
    return all
      .filter((b) => (params?.includeArchived ? true : b.audit.active !== false))
      .filter((b) => (q ? b.item_name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.item_name.localeCompare(b.item_name));
  }

  async get(id: string): Promise<BomHeadDto | null> {
    const db = await getDb();
    return ((await db.get(STORES.boms, id)) as BomHeadDto | undefined) ?? null;
  }

  async create(draft: { item_id: string; item_name: string }): Promise<BomHeadDto> {
    const db = await getDb();
    const id = `bom_${crypto.randomUUID()}`;
    const versionId = `${id}_v1`;
    const head: BomHeadDto = {
      id,
      item_id: draft.item_id,
      item_name: draft.item_name,
      active_version_id: versionId,
      versions: [
        {
          id: versionId,
          bom_head_id: id,
          version_number: 1,
          status: "draft",
          lines: [],
          audit: seedAudit(this.currentUser()),
        },
      ],
      audit: seedAudit(this.currentUser()),
    };
    await db.put(STORES.boms, head);
    return head;
  }

  async addVersion(headId: string, expectedVersion: number): Promise<BomHeadDto> {
    const db = await getDb();
    const current = (await db.get(STORES.boms, headId)) as BomHeadDto | undefined;
    if (!current) throw new RepoError("not_found", `bom ${headId} not found`);
    if (current.audit.version !== expectedVersion) {
      throw new RepoError("stale", "bom head version mismatch", current);
    }
    const prev = current.versions[current.versions.length - 1];
    const newVersion: BomVersionDto = {
      id: `${headId}_v${prev.version_number + 1}`,
      bom_head_id: headId,
      version_number: prev.version_number + 1,
      status: "draft",
      lines: prev.lines.map((l) => ({ ...l, id: `bl_${crypto.randomUUID()}` })),
      audit: seedAudit(this.currentUser()),
    };
    const next: BomHeadDto = {
      ...current,
      versions: [...current.versions, newVersion],
      audit: bumpAudit(current.audit, this.currentUser()),
    };
    await db.put(STORES.boms, next);
    return next;
  }

  async activateVersion(
    headId: string,
    versionId: string,
    expectedVersion: number
  ): Promise<BomHeadDto> {
    const db = await getDb();
    const current = (await db.get(STORES.boms, headId)) as BomHeadDto | undefined;
    if (!current) throw new RepoError("not_found", `bom ${headId} not found`);
    if (current.audit.version !== expectedVersion) {
      throw new RepoError("stale", "bom head version mismatch", current);
    }
    const target = current.versions.find((v) => v.id === versionId);
    if (!target) throw new RepoError("not_found", `version ${versionId} not found`);
    const versions = current.versions.map((v) => {
      if (v.id === versionId) {
        return {
          ...v,
          status: "active" as const,
          effective_at: new Date().toISOString(),
          audit: bumpAudit(v.audit, this.currentUser()),
        };
      }
      if (v.status === "active") {
        return {
          ...v,
          status: "retired" as const,
          audit: bumpAudit(v.audit, this.currentUser()),
        };
      }
      return v;
    });
    const next: BomHeadDto = {
      ...current,
      active_version_id: versionId,
      versions,
      audit: bumpAudit(current.audit, this.currentUser()),
    };
    await db.put(STORES.boms, next);
    return next;
  }

  async updateLines(
    headId: string,
    versionId: string,
    lines: BomVersionDto["lines"],
    expectedVersion: number
  ): Promise<BomHeadDto> {
    const db = await getDb();
    const current = (await db.get(STORES.boms, headId)) as BomHeadDto | undefined;
    if (!current) throw new RepoError("not_found", `bom ${headId} not found`);
    if (current.audit.version !== expectedVersion) {
      throw new RepoError("stale", "bom head version mismatch", current);
    }
    const target = current.versions.find((v) => v.id === versionId);
    if (!target) throw new RepoError("not_found", `version ${versionId} not found`);
    if (target.status !== "draft") {
      throw new RepoError(
        "conflict",
        `Cannot edit lines on ${target.status} version. Create a new draft.`
      );
    }
    const versions = current.versions.map((v) =>
      v.id === versionId
        ? {
            ...v,
            lines,
            audit: bumpAudit(v.audit, this.currentUser()),
          }
        : v
    );
    const next: BomHeadDto = {
      ...current,
      versions,
      audit: bumpAudit(current.audit, this.currentUser()),
    };
    await db.put(STORES.boms, next);
    return next;
  }
}
