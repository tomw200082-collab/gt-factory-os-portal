"use client";

import { getDb, type StoreName } from "./idb";
import { bumpAudit, seedAudit } from "@/lib/fixtures/audit";
import type { AuditMeta } from "@/lib/contracts/dto";
import type { QueryListParams, Repository } from "./types";

interface WithIdAudit {
  id: string;
  audit: AuditMeta;
}

export class GenericIdbRepo<T extends WithIdAudit> implements Repository<T> {
  constructor(
    private readonly store: StoreName,
    private readonly searchFields: (keyof T)[],
    private readonly currentUser: () => string = () => "local"
  ) {}

  async list(params?: QueryListParams): Promise<T[]> {
    const db = await getDb();
    const all = (await db.getAll(this.store)) as T[];
    const q = params?.query?.trim().toLowerCase();
    const includeArchived = params?.includeArchived ?? false;
    const filtered = all.filter((row) => {
      if (!includeArchived && row.audit.active === false) return false;
      if (!q) return true;
      return this.searchFields.some((f) => {
        const v = row[f];
        return typeof v === "string" && v.toLowerCase().includes(q);
      });
    });
    return filtered.sort((a, b) => {
      const an = String((a as unknown as { name?: string }).name ?? a.id);
      const bn = String((b as unknown as { name?: string }).name ?? b.id);
      return an.localeCompare(bn);
    });
  }

  async get(id: string): Promise<T | null> {
    const db = await getDb();
    const row = (await db.get(this.store, id)) as T | undefined;
    return row ?? null;
  }

  async create(draft: Omit<T, "id" | "audit"> & { id?: string }): Promise<T> {
    const db = await getDb();
    const id = draft.id ?? `${this.store.slice(0, 3)}_${crypto.randomUUID()}`;
    const row = {
      ...(draft as object),
      id,
      audit: seedAudit(this.currentUser()),
    } as T;
    await db.put(this.store, row);
    return row;
  }

  async update(id: string, patch: Partial<T>, expectedVersion: number): Promise<T> {
    const db = await getDb();
    const current = (await db.get(this.store, id)) as T | undefined;
    if (!current) throw new RepoError("not_found", `${this.store}/${id} not found`);
    if (current.audit.version !== expectedVersion) {
      throw new RepoError(
        "stale",
        `Expected version ${expectedVersion}, found ${current.audit.version}`,
        current
      );
    }
    const next = {
      ...current,
      ...patch,
      id,
      audit: bumpAudit(current.audit, this.currentUser()),
    } as T;
    await db.put(this.store, next);
    return next;
  }

  async setActive(id: string, active: boolean): Promise<T> {
    const db = await getDb();
    const current = (await db.get(this.store, id)) as T | undefined;
    if (!current) throw new RepoError("not_found", `${this.store}/${id} not found`);
    const next = {
      ...current,
      audit: { ...bumpAudit(current.audit, this.currentUser()), active },
    } as T;
    await db.put(this.store, next);
    return next;
  }
}

export class RepoError extends Error {
  constructor(
    public readonly code: "not_found" | "stale" | "conflict" | "validation",
    message: string,
    public readonly current?: unknown
  ) {
    super(message);
    this.name = "RepoError";
  }
}
