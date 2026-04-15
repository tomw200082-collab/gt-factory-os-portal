// ---------------------------------------------------------------------------
// Repository contracts — reconciled for Phase A.
//
// The generic Repository<TDto> shape no longer assumes every master DTO
// has an `id: string` field. Instead the repo constructor receives an
// explicit `idOf` extractor, because the locked schema uses different
// primary-key column names per master table:
//
//    items             → item_id           (text)
//    components        → component_id      (text)
//    suppliers         → supplier_id       (text)
//    supplier_items    → supplier_item_id  (uuid)
//    bom_head          → bom_head_id       (text)
//    bom_version       → bom_version_id    (uuid)
//    bom_lines         → line_id           (uuid)
//    planning_policy   → key               (text, no audit envelope)
//
// PlanningPolicyDto is a key-value store with no audit envelope, so it
// gets its own narrower KeyValueRepository<T> contract (see below). This
// is the structural decision approved in Gate 1: narrower repo, not
// weaker WithIdAudit generic, not softened DTO.
//
// BomsRepo is also rewritten here. The previous draft embedded
// `versions: BomVersionDto[]` inside BomHeadDto; the locked three-table
// schema (0003_bom_three_table.sql) keeps heads, versions, and lines as
// separate tables. The new BomsRepo surface exposes three fetch
// families (heads, versions, lines) and the DRAFT→ACTIVE→ARCHIVED state
// machine.
// ---------------------------------------------------------------------------

import type {
  BomHeadDto,
  BomLineDto,
  BomVersionDto,
  ComponentDto,
  ItemDto,
  PlanningPolicyDto,
  SupplierDto,
  SupplierItemDto,
} from "@/lib/contracts/dto";

export interface QueryListParams {
  query?: string;
  includeArchived?: boolean;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Audited master repository — for tables with an AuditMeta envelope and
// optimistic concurrency via audit.version.
// ---------------------------------------------------------------------------
export interface Repository<TDto> {
  list(params?: QueryListParams): Promise<TDto[]>;
  get(id: string): Promise<TDto | null>;
  create(draft: Omit<TDto, "audit">): Promise<TDto>;
  update(id: string, patch: Partial<TDto>, expectedVersion: number): Promise<TDto>;
  setActive(id: string, active: boolean): Promise<TDto>;
}

export type ItemsRepo = Repository<ItemDto>;
export type ComponentsRepo = Repository<ComponentDto>;
export type SuppliersRepo = Repository<SupplierDto>;
export type SupplierItemsRepo = Repository<SupplierItemDto>;
// UsersRepo is defined inline in users-repo.ts — UserDto intentionally
// does not carry an AuditMeta envelope, so it does not satisfy the
// audited Repository<T> shape and is served by a custom ad-hoc object.

// ---------------------------------------------------------------------------
// Key-value repository — narrower contract for flat text K/V tables
// (planning_policy). No audit envelope, no optimistic concurrency via
// version bump, no soft-delete. Upsert semantics.
//
// Phase A structural decision (Gate 1): PlanningPolicyDto is genuinely
// heterogeneous with the audited masters; the right fix is a narrower
// repo, not a weakened generic.
// ---------------------------------------------------------------------------
export interface KeyValueRepository<TDto> {
  list(params?: { query?: string }): Promise<TDto[]>;
  get(key: string): Promise<TDto | null>;
  put(row: TDto): Promise<TDto>;
  remove(key: string): Promise<void>;
}

export type PlanningPolicyRepo = KeyValueRepository<PlanningPolicyDto>;

// ---------------------------------------------------------------------------
// BomsRepo — three-table BOM model surface.
//
// Matches db/migrations/0003_bom_three_table.sql:
//
//   bom_head         — text PK, holds bom_kind + display metadata
//   bom_version      — uuid PK, DRAFT → ACTIVE → ARCHIVED lifecycle
//   bom_lines        — uuid PK, only editable on DRAFT versions
//
// Invariants enforced in the IDB implementation:
//
//   - At most one ACTIVE version per head (matches partial unique index
//     uniq_bom_version_one_active_per_head).
//   - DRAFT → ACTIVE activation demotes the previously ACTIVE version to
//     ARCHIVED in a single transaction (matches A20 demote-then-promote
//     doctrine from 0002_masters.test.sql).
//   - Line edits rejected on non-DRAFT versions (matches the BOM
//     draft-only edit rule in boms-repo.test.ts).
// ---------------------------------------------------------------------------
export interface BomsRepo {
  // Heads
  listHeads(params?: QueryListParams): Promise<BomHeadDto[]>;
  getHead(headId: string): Promise<BomHeadDto | null>;
  createHead(draft: Omit<BomHeadDto, "audit">): Promise<BomHeadDto>;

  // Versions — fetched per head, not embedded
  listVersions(headId: string): Promise<BomVersionDto[]>;
  getVersion(versionId: string): Promise<BomVersionDto | null>;
  createDraftVersion(
    headId: string,
    cloneFromVersionId?: string,
  ): Promise<BomVersionDto>;
  /**
   * Activates the given DRAFT version, demoting any currently ACTIVE
   * version on the same head to ARCHIVED in the same transaction.
   * Mirrors the atomic demote-then-promote pattern pinned by
   * db/tests/0002_masters.test.sql A20/A21.
   */
  activateVersion(
    headId: string,
    versionId: string,
    expectedHeadVersion: number,
  ): Promise<BomHeadDto>;
  archiveVersion(versionId: string): Promise<BomVersionDto>;

  // Lines — fetched per version, editable only on DRAFT
  listLines(versionId: string): Promise<BomLineDto[]>;
  updateLines(
    versionId: string,
    lines: BomLineDto[],
    expectedVersionAudit: number,
  ): Promise<BomVersionDto>;
}
