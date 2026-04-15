"use client";

import { getDb, type StoreName } from "./idb";
import { bumpAudit, seedAudit } from "@/lib/fixtures/audit";
import type { AuditMeta } from "@/lib/contracts/dto";
import type {
  KeyValueRepository,
  QueryListParams,
  Repository,
} from "./types";

// ---------------------------------------------------------------------------
// GenericIdbRepo — master repository with audit envelope.
//
// Phase A reconciliation:
//
//   - The constraint dropped from `T extends { id: string; audit: AuditMeta }`
//     to `T extends HasAudit` only. Every master DTO in the locked schema
//     has its own PK column name (item_id, component_id, etc.), so the
//     repo no longer assumes a synthetic `id` field.
//
//   - A pluggable `idOf(row)` extractor tells the repo where the primary
//     key lives on each DTO. The IDB object store's `keyPath` in idb.ts
//     is set to the same column name, so `db.put(store, row)` extracts
//     the key automatically.
//
//   - `list()`'s sort order no longer assumes a `.name` or `.id` field
//     — it sorts by the FIRST search field (items sort by item_name,
//     components by component_name, suppliers by supplier_name_official,
//     etc.). If the caller passes a non-string first search field, the
//     sort falls back to the extracted PK.
//
//   - `create()` no longer strips an `id` field from the draft. Each
//     domain caller is responsible for minting its own PK (text IDs are
//     meaningful per locked decision 57: items have IDs like FG-MOJ-450
//     that encode family and pack size).
//
//   - `update()` no longer forcibly rewrites the PK. A runtime guard
//     rejects any patch that tries to change the PK (programmer error,
//     not a valid operation).
// ---------------------------------------------------------------------------

interface HasAudit {
  audit: AuditMeta;
}

export interface GenericIdbRepoOptions<T extends HasAudit> {
  store: StoreName;
  /** Extracts the primary key from a row. Must match idb keyPath. */
  idOf: (row: T) => string;
  /** Fields to free-text search across. First field is used as sort key. */
  searchFields: (keyof T)[];
  /** Current-user stamp for audit writes. */
  currentUser?: () => string;
}

export class GenericIdbRepo<T extends HasAudit> implements Repository<T> {
  private readonly store: StoreName;
  private readonly idOf: (row: T) => string;
  private readonly searchFields: (keyof T)[];
  private readonly currentUser: () => string;

  constructor(options: GenericIdbRepoOptions<T>) {
    this.store = options.store;
    this.idOf = options.idOf;
    this.searchFields = options.searchFields;
    this.currentUser = options.currentUser ?? (() => "local");
  }

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
    const sortField = this.searchFields[0];
    return filtered.sort((a, b) => {
      const av = sortField != null ? a[sortField] : undefined;
      const bv = sortField != null ? b[sortField] : undefined;
      const an = typeof av === "string" ? av : this.idOf(a);
      const bn = typeof bv === "string" ? bv : this.idOf(b);
      return an.localeCompare(bn);
    });
  }

  async get(id: string): Promise<T | null> {
    const db = await getDb();
    const row = (await db.get(this.store, id)) as T | undefined;
    return row ?? null;
  }

  async create(draft: Omit<T, "audit">): Promise<T> {
    const db = await getDb();
    const row = {
      ...(draft as object),
      audit: seedAudit(this.currentUser()),
    } as T;
    await db.put(this.store, row);
    return row;
  }

  async update(
    id: string,
    patch: Partial<T>,
    expectedVersion: number,
  ): Promise<T> {
    const db = await getDb();
    const current = (await db.get(this.store, id)) as T | undefined;
    if (!current) throw new RepoError("not_found", `${this.store}/${id} not found`);
    if (current.audit.version !== expectedVersion) {
      throw new RepoError(
        "stale",
        `Expected version ${expectedVersion}, found ${current.audit.version}`,
        current,
      );
    }
    const next = {
      ...current,
      ...patch,
      audit: bumpAudit(current.audit, this.currentUser()),
    } as T;
    // Runtime invariant: the PK is immutable per locked decision 57. Any
    // attempt to mutate it via patch is a caller bug — surface it loudly.
    if (this.idOf(next) !== id) {
      throw new RepoError(
        "validation",
        `Primary key cannot be changed (expected ${id}, patch produced ${this.idOf(next)})`,
      );
    }
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

// ---------------------------------------------------------------------------
// KeyValueIdbRepo — narrower repo for flat K/V tables (planning_policy).
//
// No audit envelope, no optimistic concurrency, no soft delete. Upsert
// semantics. This is the Gate 1 structural decision in practice:
// narrower contract for a genuinely narrower DTO, no softening of the
// audited generic.
// ---------------------------------------------------------------------------
export interface KeyValueIdbRepoOptions<T> {
  store: StoreName;
  keyOf: (row: T) => string;
  searchFields?: (keyof T)[];
}

export class KeyValueIdbRepo<T> implements KeyValueRepository<T> {
  private readonly store: StoreName;
  private readonly keyOf: (row: T) => string;
  private readonly searchFields: (keyof T)[];

  constructor(options: KeyValueIdbRepoOptions<T>) {
    this.store = options.store;
    this.keyOf = options.keyOf;
    this.searchFields = options.searchFields ?? [];
  }

  async list(params?: { query?: string }): Promise<T[]> {
    const db = await getDb();
    const all = (await db.getAll(this.store)) as T[];
    const q = params?.query?.trim().toLowerCase();
    const filtered = q
      ? all.filter((row) =>
          this.searchFields.some((f) => {
            const v = row[f];
            return typeof v === "string" && v.toLowerCase().includes(q);
          }),
        )
      : all;
    return filtered.sort((a, b) => this.keyOf(a).localeCompare(this.keyOf(b)));
  }

  async get(key: string): Promise<T | null> {
    const db = await getDb();
    return ((await db.get(this.store, key)) as T | undefined) ?? null;
  }

  async put(row: T): Promise<T> {
    const db = await getDb();
    await db.put(this.store, row);
    return row;
  }

  async remove(key: string): Promise<void> {
    const db = await getDb();
    await db.delete(this.store, key);
  }
}

// ---------------------------------------------------------------------------
// RepoError — unchanged.
// ---------------------------------------------------------------------------
export class RepoError extends Error {
  constructor(
    public readonly code: "not_found" | "stale" | "conflict" | "validation",
    message: string,
    public readonly current?: unknown,
  ) {
    super(message);
    this.name = "RepoError";
  }
}
