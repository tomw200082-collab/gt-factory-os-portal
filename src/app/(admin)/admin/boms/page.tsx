"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Field, FieldGrid } from "@/components/workflow/FieldGrid";
import { FormActionsBar } from "@/components/workflow/FormActionsBar";
import { SearchFilterBar } from "@/components/data/SearchFilterBar";
import { AuditSnippet } from "@/components/data/AuditSnippet";
import { Badge } from "@/components/badges/StatusBadge";
import { LineEditorTable } from "@/components/line-editor/LineEditorTable";
import { QuantityInput } from "@/components/fields/QuantityInput";
import { ApprovalBanner } from "@/components/workflow/ApprovalBanner";
import { SplitListLayout } from "@/features/master-data/SplitListLayout";
import { useHasRole } from "@/lib/auth/role-gate";
import {
  bomsRepo,
  componentsRepo,
  itemsRepo,
} from "@/lib/repositories";
import { BOM_KINDS, UOMS, type BomKind, type Uom } from "@/lib/contracts/enums";
import type {
  BomHeadDto,
  BomLineDto,
  BomVersionDto,
  ComponentDto,
  ItemDto,
} from "@/lib/contracts/dto";

// ---------------------------------------------------------------------------
// BOMs admin — reconciled for Phase A (three-table model).
//
// Matches the locked 0003_bom_three_table.sql schema:
//
//   bom_head        — text PK bom_head_id, bom_kind BASE/PACK/REPACK,
//                     PK linked to items.primary_bom_head_id AND/OR
//                     items.base_bom_head_id (two-heads-per-item model)
//   bom_version     — uuid PK, DRAFT -> ACTIVE -> ARCHIVED state machine,
//                     at most one ACTIVE per head
//   bom_lines       — uuid PK, only editable on DRAFT versions
//
// Major reshapes from the pre-Phase-A draft:
//
//   - Versions are no longer embedded in BomHeadDto. The screen
//     fetches versions via bomsRepo.listVersions(headId) as a separate
//     React Query, and lines via bomsRepo.listLines(versionId) as a
//     third query that only runs when a version is selected.
//
//   - State machine is DRAFT -> ACTIVE -> ARCHIVED (uppercase). The
//     pre-Phase-A 'retired' terminal state has been removed from the
//     repo and the UI. Historical ARCHIVED versions stay put — they
//     are not mutated when a new draft activates.
//
//   - bom_kind selector on create (BASE/PACK/REPACK). This is the
//     Tranche 1 workbook reality, not the plan draft's 'FINAL'.
//
//   - Line model uses final_component_qty + line_no instead of the
//     previous quantity_per + sort_order. scrap_factor is DROPPED
//     entirely — the locked schema does not have it, and scrap
//     belongs to the waste/adjustment ledger, not on BOM lines.
//
//   - The one-active-version-per-head invariant is enforced at the
//     repo layer via activateVersion() which atomically demotes the
//     previously ACTIVE version (A20 pattern). The UI exposes an
//     "Activate" button but the ordering logic is in the repo.
//
//   - Line UOM defaults carry over from ComponentDto.bom_uom /
//     inventory_uom rather than the previous .default_uom.
//
// BOM wiring to items (items.primary_bom_head_id and items.base_bom_
// head_id) is NOT edited on this screen either — it belongs to a
// future work: "how do we attach a BOM to an item" is a separate
// flow. For Phase A we only edit BOM heads / versions / lines
// in isolation.
// ---------------------------------------------------------------------------

type DetailMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; id: string };

interface EditableLine {
  line_id: string;
  bom_version_id: string;
  component_id: string;
  component_name: string;
  final_component_qty: number;
  component_uom: Uom;
  line_no: number;
}

export default function BomsAdminPage() {
  const canWrite = useHasRole("admin");
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<DetailMode>({ kind: "closed" });

  const { data: heads = [] } = useQuery({
    queryKey: ["boms", query],
    queryFn: () => bomsRepo.listHeads({ query }),
  });
  const { data: items = [] } = useQuery({
    queryKey: ["items-for-boms"],
    queryFn: () => itemsRepo.list({ includeArchived: true }),
  });
  const { data: components = [] } = useQuery({
    queryKey: ["components-for-boms"],
    queryFn: () => componentsRepo.list(),
  });

  const selectedHead =
    detail.kind === "edit"
      ? (heads.find((b) => b.bom_head_id === detail.id) ?? null)
      : null;

  return (
    <>
      <WorkflowHeader
        eyebrow="Master data"
        title="Bills of materials"
        description="Three-table BOM model: head + version + lines. DRAFT is editable; ACTIVE and ARCHIVED are read-only. At most one ACTIVE version per head; activation atomically demotes the previous primary."
        actions={
          canWrite ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setDetail({ kind: "create" })}
            >
              + New BOM head
            </button>
          ) : (
            <Badge tone="neutral">read-only for planner</Badge>
          )
        }
      />

      <SplitListLayout
        isDetailOpen={detail.kind !== "closed"}
        list={
          <SectionCard
            title={`${heads.length} BOM head${heads.length === 1 ? "" : "s"}`}
          >
            <div className="mb-3">
              <SearchFilterBar
                query={query}
                onQueryChange={setQuery}
                placeholder="Search by BOM head ID, family, parent…"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>BOM head ID</th>
                    <th>Kind</th>
                    <th>Display family</th>
                    <th>Parent</th>
                    <th className="text-right">Output qty</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {heads.map((h) => (
                    <tr
                      key={h.bom_head_id}
                      className="cursor-pointer"
                      onClick={() =>
                        setDetail({ kind: "edit", id: h.bom_head_id })
                      }
                    >
                      <td className="font-mono text-xs">{h.bom_head_id}</td>
                      <td>
                        <Badge tone="neutral">{h.bom_kind}</Badge>
                      </td>
                      <td className="text-xs">{h.display_family ?? "—"}</td>
                      <td className="text-xs text-fg-muted">
                        {h.parent_name ?? h.parent_ref_id ?? "—"}
                      </td>
                      <td className="text-right font-mono tabular-nums">
                        {h.final_bom_output_qty} {h.final_bom_output_uom}
                      </td>
                      <td>
                        {h.status === "ACTIVE" ? (
                          <Badge tone="success">ACTIVE</Badge>
                        ) : h.status === "PENDING" ? (
                          <Badge tone="warning">PENDING</Badge>
                        ) : h.status === "ARCHIVED" ? (
                          <Badge tone="neutral">ARCHIVED</Badge>
                        ) : (
                          <Badge tone="neutral">INACTIVE</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        }
        detail={
          detail.kind === "create" ? (
            <CreateBomHeadPanel
              items={items}
              onClose={() => setDetail({ kind: "closed" })}
              onCreated={(id) => {
                qc.invalidateQueries({ queryKey: ["boms"] });
                setDetail({ kind: "edit", id });
              }}
            />
          ) : detail.kind === "edit" && selectedHead ? (
            <BomDetailPanel
              head={selectedHead}
              components={components}
              onClose={() => setDetail({ kind: "closed" })}
              onSaved={() => qc.invalidateQueries({ queryKey: ["boms"] })}
            />
          ) : null
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Create panel — spawns a new BOM head with an empty DRAFT version.
//
// The locked schema has separate bom_head and bom_version tables. This
// flow creates the head first (via bomsRepo.createHead) with
// status=PENDING and active_version_id=null, then calls
// createDraftVersion(headId) to seed an empty draft. The user then
// edits lines in the detail panel and Activates when ready.
// ---------------------------------------------------------------------------
function CreateBomHeadPanel({
  items,
  onClose,
  onCreated,
}: {
  items: ItemDto[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [headId, setHeadId] = useState("");
  const [bomKind, setBomKind] = useState<BomKind>("BASE");
  const [outputQty, setOutputQty] = useState<number>(1);
  const [outputUom, setOutputUom] = useState<Uom>("L");
  const [displayFamily, setDisplayFamily] = useState("");
  const [parentItemId, setParentItemId] = useState<string>("");

  const createMut = useMutation({
    mutationFn: async () => {
      if (!headId) throw new Error("Enter a BOM head ID");
      const draft = {
        bom_head_id: headId,
        bom_kind: bomKind,
        display_family: displayFamily || null,
        sweetness: null,
        pack_size: null,
        parent_ref_type: parentItemId ? "ITEM" : null,
        parent_ref_id: parentItemId || null,
        parent_name:
          items.find((i) => i.item_id === parentItemId)?.item_name ?? null,
        linked_base_bom_head_id: null,
        final_bom_output_qty: outputQty,
        final_bom_output_uom: outputUom,
        active_version_id: null,
        status: "PENDING" as const,
        review_flag: null,
        owner_notes: null,
        site_id: "GT-MAIN",
      };
      const head = await bomsRepo.createHead(draft);
      // Seed an empty DRAFT version so the editor has something to
      // point at immediately.
      await bomsRepo.createDraftVersion(head.bom_head_id);
      return head;
    },
    onSuccess: (head) => onCreated(head.bom_head_id),
  });

  return (
    <SectionCard
      title="New BOM head"
      description="Creates a head plus an empty DRAFT version. Edit lines next, then Activate."
      actions={
        <button
          type="button"
          className="btn btn-ghost text-xs"
          onClick={onClose}
        >
          Close
        </button>
      }
    >
      <div className="space-y-4">
        <FieldGrid columns={2}>
          <Field label="BOM head ID" required>
            <input
              className="input font-mono"
              placeholder="e.g. BOM-BASE-NEW-REG"
              value={headId}
              onChange={(e) => setHeadId(e.target.value)}
            />
          </Field>
          <Field label="Kind" required>
            <select
              className="input"
              value={bomKind}
              onChange={(e) => setBomKind(e.target.value as BomKind)}
            >
              {BOM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Display family" span={2}>
            <input
              className="input"
              placeholder="e.g. MOJITO"
              value={displayFamily}
              onChange={(e) => setDisplayFamily(e.target.value)}
            />
          </Field>
          <Field label="Output qty" required>
            <input
              type="number"
              step="any"
              min="0"
              className="input"
              value={outputQty}
              onChange={(e) => setOutputQty(Number(e.target.value))}
            />
          </Field>
          <Field label="Output UOM" required>
            <select
              className="input"
              value={outputUom}
              onChange={(e) => setOutputUom(e.target.value as Uom)}
            >
              {UOMS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Parent item (optional)"
            span={2}
            hint="PACK and REPACK heads typically point at a specific FG item. BASE heads usually do not."
          >
            <select
              className="input"
              value={parentItemId}
              onChange={(e) => setParentItemId(e.target.value)}
            >
              <option value="">— none —</option>
              {items.map((i) => (
                <option key={i.item_id} value={i.item_id}>
                  {i.item_name}
                </option>
              ))}
            </select>
          </Field>
        </FieldGrid>
        <FormActionsBar
          hint="You will edit the empty draft next, then activate it."
          primary={
            <button
              type="button"
              className="btn btn-primary"
              disabled={!headId || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Create head + DRAFT v1
            </button>
          }
        />
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Detail panel — edits versions + lines for a selected head.
//
// Versions and lines are fetched with their own React Queries so the
// embedded-versions model from the pre-Phase-A draft does not leak
// back in.
// ---------------------------------------------------------------------------
function BomDetailPanel({
  head,
  components,
  onClose,
  onSaved,
}: {
  head: BomHeadDto;
  components: ComponentDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const canWrite = useHasRole("admin");
  const qc = useQueryClient();

  const { data: versions = [] } = useQuery({
    queryKey: ["bom-versions", head.bom_head_id],
    queryFn: () => bomsRepo.listVersions(head.bom_head_id),
  });

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  // Keep selection in sync when versions arrive or change.
  useEffect(() => {
    if (versions.length === 0) {
      setSelectedVersionId(null);
      return;
    }
    if (
      selectedVersionId &&
      versions.some((v) => v.bom_version_id === selectedVersionId)
    ) {
      return;
    }
    // Prefer the head's declared active version; fall back to the
    // latest by version_label ordering (listVersions returns sorted).
    const fallback =
      (head.active_version_id &&
        versions.find((v) => v.bom_version_id === head.active_version_id)
          ?.bom_version_id) ??
      versions[versions.length - 1].bom_version_id;
    setSelectedVersionId(fallback);
  }, [versions, head.active_version_id, selectedVersionId]);

  const selectedVersion: BomVersionDto | null = useMemo(
    () =>
      versions.find((v) => v.bom_version_id === selectedVersionId) ?? null,
    [versions, selectedVersionId],
  );

  const { data: fetchedLines = [] } = useQuery({
    queryKey: ["bom-lines", selectedVersionId],
    queryFn: () =>
      selectedVersionId
        ? bomsRepo.listLines(selectedVersionId)
        : Promise.resolve([]),
    enabled: selectedVersionId != null,
  });

  const isDraft = selectedVersion?.status === "DRAFT" && canWrite;

  const [lines, setLines] = useState<EditableLine[]>([]);
  const [dirty, setDirty] = useState(false);

  // Reload editable-lines state whenever the server-side lines change
  // (new version selected, save completed, activation happened).
  useEffect(() => {
    setLines(
      fetchedLines.map((l) => ({
        line_id: l.line_id,
        bom_version_id: l.bom_version_id,
        component_id: l.final_component_id ?? "",
        component_name: l.final_component_name ?? "",
        final_component_qty: l.final_component_qty ?? 0,
        component_uom: (l.component_uom ?? "KG") as Uom,
        line_no: l.line_no,
      })),
    );
    setDirty(false);
  }, [fetchedLines]);

  const createDraftMut = useMutation({
    mutationFn: () =>
      bomsRepo.createDraftVersion(
        head.bom_head_id,
        selectedVersion?.bom_version_id,
      ),
    onSuccess: (draft) => {
      onSaved();
      qc.invalidateQueries({
        queryKey: ["bom-versions", head.bom_head_id],
      });
      setSelectedVersionId(draft.bom_version_id);
    },
  });

  const saveLinesMut = useMutation({
    mutationFn: async () => {
      if (!selectedVersion) throw new Error("no version");
      const payload: BomLineDto[] = lines.map((l, idx) => ({
        line_id:
          l.line_id && !l.line_id.startsWith("new_")
            ? l.line_id
            : typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `line-${Date.now()}-${idx}`,
        bom_version_id: selectedVersion.bom_version_id,
        bom_head_id: head.bom_head_id,
        line_no: idx + 1,
        bom_kind: head.bom_kind,
        component_ref_type: "COMPONENT",
        final_component_id: l.component_id || null,
        final_component_name: l.component_name || null,
        final_component_qty: Number(l.final_component_qty) || 0,
        component_uom: l.component_uom,
        status: "ACTIVE",
        scaling_method: "RATIO",
        qty_per_l_output: null,
        std_cost_per_uom: null,
        line_std_cost: null,
        notes: null,
        site_id: head.site_id,
      }));
      return bomsRepo.updateLines(
        selectedVersion.bom_version_id,
        payload,
        // BomVersionDto does not carry an audit.version; the repo
        // keeps the parameter for API symmetry but ignores it. See
        // boms-repo.ts updateLines comment.
        0,
      );
    },
    onSuccess: () => {
      setDirty(false);
      onSaved();
      qc.invalidateQueries({
        queryKey: ["bom-lines", selectedVersion?.bom_version_id],
      });
    },
  });

  const activateMut = useMutation({
    mutationFn: () => {
      if (!selectedVersion) throw new Error("no version");
      return bomsRepo.activateVersion(
        head.bom_head_id,
        selectedVersion.bom_version_id,
        head.audit.version,
      );
    },
    onSuccess: () => {
      onSaved();
      qc.invalidateQueries({
        queryKey: ["bom-versions", head.bom_head_id],
      });
    },
  });

  const addLine = () => {
    setLines((l) => [
      ...l,
      {
        line_id: `new_${l.length + 1}_${Date.now()}`,
        bom_version_id: selectedVersion?.bom_version_id ?? "",
        component_id: "",
        component_name: "",
        final_component_qty: 0,
        component_uom: "KG",
        line_no: l.length + 1,
      },
    ]);
    setDirty(true);
  };
  const removeLine = (index: number) => {
    setLines((l) => l.filter((_, i) => i !== index));
    setDirty(true);
  };
  const updateLine = (index: number, patch: Partial<EditableLine>) => {
    setLines((l) => l.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setDirty(true);
  };

  if (!selectedVersion) {
    return (
      <SectionCard
        title={head.bom_head_id}
        description="No versions yet. Create one to start editing."
        actions={
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={onClose}
          >
            Close
          </button>
        }
      >
        {canWrite ? (
          <FormActionsBar
            primary={
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => createDraftMut.mutate()}
              >
                Create first DRAFT version
              </button>
            }
          />
        ) : null}
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={head.bom_head_id}
      description={`${head.bom_kind} — ${head.display_family ?? "no family"} — output ${head.final_bom_output_qty} ${head.final_bom_output_uom}`}
      actions={
        <button
          type="button"
          className="btn btn-ghost text-xs"
          onClick={onClose}
        >
          Close
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">
            Versions
          </span>
          {versions.map((v) => (
            <button
              key={v.bom_version_id}
              type="button"
              onClick={() => setSelectedVersionId(v.bom_version_id)}
              className={
                "chip cursor-pointer " +
                (v.bom_version_id === selectedVersionId
                  ? "border-accent bg-accent-soft text-accent"
                  : "")
              }
            >
              {v.version_label} · {v.status}
            </button>
          ))}
          {canWrite ? (
            <button
              type="button"
              className="btn btn-ghost text-xs"
              onClick={() => createDraftMut.mutate()}
              disabled={createDraftMut.isPending}
            >
              + New draft from latest
            </button>
          ) : null}
        </div>

        {!isDraft ? (
          <ApprovalBanner
            tone="info"
            title={`Viewing version ${selectedVersion.version_label} (${selectedVersion.status})`}
            reason="Lines are read-only. Create a new draft to propose changes; activating it will atomically archive the current active version."
          />
        ) : null}

        <LineEditorTable<EditableLine>
          rows={lines}
          keyFor={(row, i) => row.line_id + i}
          onAddRow={isDraft ? addLine : undefined}
          onRemoveRow={isDraft ? removeLine : undefined}
          addLabel="Add BOM line"
          columns={[
            {
              key: "component",
              header: "Component",
              width: "45%",
              render: (row, i) =>
                isDraft ? (
                  <select
                    className="input h-8"
                    value={row.component_id}
                    onChange={(e) => {
                      const comp = components.find(
                        (c) => c.component_id === e.target.value,
                      );
                      updateLine(i, {
                        component_id: e.target.value,
                        component_name: comp?.component_name ?? "",
                        component_uom:
                          (comp?.bom_uom ??
                            comp?.inventory_uom ??
                            row.component_uom) as Uom,
                      });
                    }}
                  >
                    <option value="">— select —</option>
                    {components.map((c) => (
                      <option key={c.component_id} value={c.component_id}>
                        {c.component_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span>{row.component_name}</span>
                ),
            },
            {
              key: "qty",
              header: "Qty per output",
              align: "right",
              render: (row, i) =>
                isDraft ? (
                  <QuantityInput
                    value={row.final_component_qty}
                    unit={row.component_uom}
                    onChange={(e) =>
                      updateLine(i, {
                        final_component_qty: Number(e.target.value),
                      })
                    }
                    className="h-8"
                  />
                ) : (
                  <span className="font-mono text-xs tabular-nums">
                    {row.final_component_qty} {row.component_uom}
                  </span>
                ),
            },
            {
              key: "unit",
              header: "UoM",
              render: (row, i) =>
                isDraft ? (
                  <select
                    className="input h-8"
                    value={row.component_uom}
                    onChange={(e) =>
                      updateLine(i, { component_uom: e.target.value as Uom })
                    }
                  >
                    {UOMS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs">{row.component_uom}</span>
                ),
            },
          ]}
        />

        <details className="rounded-md border border-border bg-bg-subtle p-3">
          <summary className="cursor-pointer text-xs font-medium text-fg-muted">
            Audit (head)
          </summary>
          <div className="mt-2">
            <AuditSnippet audit={head.audit} />
          </div>
        </details>

        <FormActionsBar
          hint={
            !canWrite
              ? "Read-only for planner role."
              : isDraft
                ? "Save changes first, then activate to atomically archive the current active version."
                : "Read-only view. Create a new draft to propose changes."
          }
          secondary={
            canWrite && isDraft ? (
              <button
                type="button"
                className="btn"
                onClick={() => activateMut.mutate()}
                disabled={dirty || activateMut.isPending}
                title={
                  dirty
                    ? "Save changes first"
                    : "Atomically archive the current ACTIVE version and promote this DRAFT"
                }
              >
                Activate version
              </button>
            ) : null
          }
          primary={
            !canWrite ? null : isDraft ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!dirty || saveLinesMut.isPending}
                onClick={() => saveLinesMut.mutate()}
              >
                Save draft lines
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => createDraftMut.mutate()}
              >
                Start new draft from this version
              </button>
            )
          }
        />
      </div>
    </SectionCard>
  );
}
