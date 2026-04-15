"use client";

import { useMemo, useState } from "react";
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
import { bomsRepo, componentsRepo, itemsRepo } from "@/lib/repositories";
import { UOMS, type Uom } from "@/lib/contracts/enums";
import type { BomHeadDto, BomLineDto, BomVersionDto } from "@/lib/contracts/dto";

type DetailMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; id: string };

interface EditableLine {
  id: string;
  component_id: string;
  component_name: string;
  quantity_per: number;
  unit: Uom;
  scrap_factor: number;
  sort_order: number;
}

export default function BomsAdminPage() {
  const canWrite = useHasRole("admin");
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<DetailMode>({ kind: "closed" });

  const { data: boms = [] } = useQuery({
    queryKey: ["boms", query],
    queryFn: () => bomsRepo.list({ query }),
  });
  const { data: items = [] } = useQuery({
    queryKey: ["items-for-boms"],
    queryFn: () => itemsRepo.list(),
  });
  const { data: components = [] } = useQuery({
    queryKey: ["components-for-boms"],
    queryFn: () => componentsRepo.list(),
  });

  const selectedBom =
    detail.kind === "edit" ? boms.find((b) => b.id === detail.id) ?? null : null;

  return (
    <>
      <WorkflowHeader
        eyebrow="Master data"
        title="Bills of materials"
        description="Versioned BOMs per finished-good item. New versions are drafted, edited, then activated. Historical production postings keep their original version pinning."
        actions={
          canWrite ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setDetail({ kind: "create" })}
            >
              + New BOM
            </button>
          ) : (
            <Badge tone="neutral">read-only for planner</Badge>
          )
        }
      />

      <SplitListLayout
        isDetailOpen={detail.kind !== "closed"}
        list={
          <SectionCard title={`${boms.length} BOM${boms.length === 1 ? "" : "s"}`}>
            <div className="mb-3">
              <SearchFilterBar
                query={query}
                onQueryChange={setQuery}
                placeholder="Search by item name…"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Active version</th>
                    <th className="text-right">Lines</th>
                    <th>Versions</th>
                  </tr>
                </thead>
                <tbody>
                  {boms.map((b) => {
                    const active = b.versions.find((v) => v.id === b.active_version_id);
                    return (
                      <tr
                        key={b.id}
                        className="cursor-pointer"
                        onClick={() => setDetail({ kind: "edit", id: b.id })}
                      >
                        <td className="font-medium">{b.item_name}</td>
                        <td>
                          {active ? (
                            <Badge tone="success">v{active.version_number}</Badge>
                          ) : (
                            <Badge tone="neutral">no active</Badge>
                          )}
                        </td>
                        <td className="text-right font-mono tabular-nums">
                          {active?.lines.length ?? "—"}
                        </td>
                        <td>
                          <div className="flex gap-1">
                            {b.versions.map((v) => (
                              <Badge
                                key={v.id}
                                tone={
                                  v.status === "active"
                                    ? "success"
                                    : v.status === "draft"
                                      ? "warning"
                                      : "neutral"
                                }
                              >
                                v{v.version_number}·{v.status}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        }
        detail={
          detail.kind === "create" ? (
            <CreateBomPanel
              items={items}
              onClose={() => setDetail({ kind: "closed" })}
              onCreated={(id) => {
                qc.invalidateQueries({ queryKey: ["boms"] });
                setDetail({ kind: "edit", id });
              }}
            />
          ) : detail.kind === "edit" && selectedBom ? (
            <BomDetailPanel
              bom={selectedBom}
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

function CreateBomPanel({
  items,
  onClose,
  onCreated,
}: {
  items: { id: string; name: string; active_bom_id?: string }[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [itemId, setItemId] = useState("");
  const createMut = useMutation({
    mutationFn: async () => {
      const item = items.find((i) => i.id === itemId);
      if (!item) throw new Error("choose an item");
      return bomsRepo.create({ item_id: item.id, item_name: item.name });
    },
    onSuccess: (bom) => onCreated(bom.id),
  });

  return (
    <SectionCard
      title="New BOM"
      description="Creates a BOM head with an empty draft version v1."
      actions={
        <button type="button" className="btn btn-ghost text-xs" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-4">
        <Field label="For item" required>
          <select
            className="input"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
          >
            <option value="">— select an item —</option>
            {items.map((i) => (
              <option key={i.id} value={i.id} disabled={!!i.active_bom_id}>
                {i.name}
                {i.active_bom_id ? " (already has BOM)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <FormActionsBar
          hint="You will edit the empty draft next, then activate it."
          primary={
            <button
              type="button"
              className="btn btn-primary"
              disabled={!itemId || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Create draft v1
            </button>
          }
        />
      </div>
    </SectionCard>
  );
}

function BomDetailPanel({
  bom,
  components,
  onClose,
  onSaved,
}: {
  bom: BomHeadDto;
  components: { id: string; name: string; default_uom: Uom }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const canWrite = useHasRole("admin");
  const qc = useQueryClient();
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    bom.active_version_id ?? bom.versions[bom.versions.length - 1]?.id
  );
  const selectedVersion = useMemo(
    () => bom.versions.find((v) => v.id === selectedVersionId) ?? null,
    [bom, selectedVersionId]
  );
  const isDraft = selectedVersion?.status === "draft" && canWrite;

  const [lines, setLines] = useState<EditableLine[]>(
    selectedVersion ? selectedVersion.lines.map((l) => ({ ...l, unit: l.unit as Uom })) : []
  );
  const [dirty, setDirty] = useState(false);

  const addVersionMut = useMutation({
    mutationFn: () => bomsRepo.addVersion(bom.id, bom.audit.version),
    onSuccess: (next) => {
      onSaved();
      const draft = next.versions[next.versions.length - 1];
      setSelectedVersionId(draft.id);
      setLines(draft.lines.map((l) => ({ ...l, unit: l.unit as Uom })));
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["boms"] });
    },
  });

  const saveLinesMut = useMutation({
    mutationFn: () => {
      if (!selectedVersion) throw new Error("no version");
      const payload: BomLineDto[] = lines.map((l, idx) => ({
        id: l.id || `bl_${crypto.randomUUID()}`,
        component_id: l.component_id,
        component_name: l.component_name,
        quantity_per: Number(l.quantity_per) || 0,
        unit: l.unit,
        scrap_factor: Number(l.scrap_factor) || 0,
        sort_order: idx + 1,
      }));
      return bomsRepo.updateLines(bom.id, selectedVersion.id, payload, bom.audit.version);
    },
    onSuccess: () => {
      setDirty(false);
      onSaved();
    },
  });

  const activateMut = useMutation({
    mutationFn: () => {
      if (!selectedVersion) throw new Error("no version");
      return bomsRepo.activateVersion(bom.id, selectedVersion.id, bom.audit.version);
    },
    onSuccess: () => onSaved(),
  });

  const addLine = () => {
    setLines((l) => [
      ...l,
      {
        id: `new_${l.length + 1}_${Date.now()}`,
        component_id: "",
        component_name: "",
        quantity_per: 0,
        unit: "kg",
        scrap_factor: 0,
        sort_order: l.length + 1,
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

  if (!selectedVersion) return null;

  return (
    <SectionCard
      title={bom.item_name}
      description="Versioned BOM editor. Only draft versions are editable."
      actions={
        <button type="button" className="btn btn-ghost text-xs" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">
            Versions
          </span>
          {bom.versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setSelectedVersionId(v.id);
                setLines(v.lines.map((l) => ({ ...l, unit: l.unit as Uom })));
                setDirty(false);
              }}
              className={
                "chip cursor-pointer " +
                (v.id === selectedVersionId ? "border-accent bg-accent-soft text-accent" : "")
              }
            >
              v{v.version_number} · {v.status}
            </button>
          ))}
          {canWrite ? (
            <button
              type="button"
              className="btn btn-ghost text-xs"
              onClick={() => addVersionMut.mutate()}
              disabled={addVersionMut.isPending}
            >
              + New draft from latest
            </button>
          ) : null}
        </div>

        {!isDraft ? (
          <ApprovalBanner
            tone="info"
            title={`Viewing version v${selectedVersion.version_number} (${selectedVersion.status})`}
            reason="Lines are read-only. Create a new draft to propose changes; activating it will retire the current active version."
          />
        ) : null}

        <LineEditorTable<EditableLine>
          rows={lines}
          keyFor={(row, i) => row.id + i}
          onAddRow={isDraft ? addLine : undefined}
          onRemoveRow={isDraft ? removeLine : undefined}
          addLabel="Add BOM line"
          columns={[
            {
              key: "component",
              header: "Component",
              width: "40%",
              render: (row, i) =>
                isDraft ? (
                  <select
                    className="input h-8"
                    value={row.component_id}
                    onChange={(e) => {
                      const comp = components.find((c) => c.id === e.target.value);
                      updateLine(i, {
                        component_id: e.target.value,
                        component_name: comp?.name ?? "",
                        unit: comp?.default_uom ?? row.unit,
                      });
                    }}
                  >
                    <option value="">— select —</option>
                    {components.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span>{row.component_name}</span>
                ),
            },
            {
              key: "qty",
              header: "Qty per",
              align: "right",
              render: (row, i) =>
                isDraft ? (
                  <QuantityInput
                    value={row.quantity_per}
                    unit={row.unit}
                    onChange={(e) =>
                      updateLine(i, { quantity_per: Number(e.target.value) })
                    }
                    className="h-8"
                  />
                ) : (
                  <span className="font-mono text-xs tabular-nums">
                    {row.quantity_per} {row.unit}
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
                    value={row.unit}
                    onChange={(e) => updateLine(i, { unit: e.target.value as Uom })}
                  >
                    {UOMS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs">{row.unit}</span>
                ),
            },
            {
              key: "scrap",
              header: "Scrap",
              align: "right",
              render: (row, i) =>
                isDraft ? (
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="1"
                    className="input h-8 text-right font-mono tabular-nums"
                    value={row.scrap_factor}
                    onChange={(e) =>
                      updateLine(i, { scrap_factor: Number(e.target.value) })
                    }
                  />
                ) : (
                  <span className="font-mono text-xs tabular-nums">
                    {(row.scrap_factor * 100).toFixed(1)}%
                  </span>
                ),
            },
          ]}
        />

        <details className="rounded-md border border-border bg-bg-subtle p-3">
          <summary className="cursor-pointer text-xs font-medium text-fg-muted">
            Audit
          </summary>
          <div className="mt-2">
            <AuditSnippet audit={bom.audit} />
          </div>
        </details>

        <FormActionsBar
          hint={
            !canWrite
              ? "Read-only for planner role."
              : isDraft
                ? "Save changes first, then activate to replace the current active version."
                : "Read-only view."
          }
          secondary={
            canWrite && isDraft ? (
              <button
                type="button"
                className="btn"
                onClick={() => activateMut.mutate()}
                disabled={dirty || activateMut.isPending}
                title={dirty ? "Save changes first" : "Replace current active version"}
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
                onClick={() => addVersionMut.mutate()}
              >
                Start new draft
              </button>
            )
          }
        />
      </div>
    </SectionCard>
  );
}
