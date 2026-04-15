"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Field, FieldGrid } from "@/components/workflow/FieldGrid";
import { FormActionsBar } from "@/components/workflow/FormActionsBar";
import { ValidationSummary, type ValidationIssue } from "@/components/workflow/ValidationSummary";
import { AuditSnippet } from "@/components/data/AuditSnippet";
import { SearchFilterBar } from "@/components/data/SearchFilterBar";
import { Badge } from "@/components/badges/StatusBadge";
import { SplitListLayout } from "@/features/master-data/SplitListLayout";
import { useHasRole } from "@/lib/auth/role-gate";
import { itemsRepo } from "@/lib/repositories";
import { ITEM_KINDS, SUPPLY_METHODS, UOMS, type ItemKind, type SupplyMethod, type Uom } from "@/lib/contracts/enums";
import type { ItemDto } from "@/lib/contracts/dto";

const itemSchema = z.object({
  sku: z.string().min(2, "SKU must be at least 2 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  name_local: z.string().optional(),
  kind: z.enum(ITEM_KINDS),
  supply_method: z.enum(SUPPLY_METHODS),
  default_uom: z.enum(UOMS),
  min_stock: z.coerce.number().nonnegative().optional(),
  reorder_point: z.coerce.number().nonnegative().optional(),
  target_stock: z.coerce.number().nonnegative().optional(),
  lead_time_days: z.coerce.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});
type ItemFormValues = z.infer<typeof itemSchema>;

type DetailMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; id: string };

export default function ItemsAdminPage() {
  const canWrite = useHasRole("admin");
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [kindFilter, setKindFilter] = useState<ItemKind | null>(null);
  const [detail, setDetail] = useState<DetailMode>({ kind: "closed" });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["items", query, includeArchived],
    queryFn: () => itemsRepo.list({ query, includeArchived }),
  });

  const filtered = useMemo(
    () => (kindFilter ? items.filter((i) => i.kind === kindFilter) : items),
    [items, kindFilter]
  );

  const selected =
    detail.kind === "edit" ? items.find((i) => i.id === detail.id) ?? null : null;

  return (
    <>
      <WorkflowHeader
        eyebrow="Master data"
        title="Items"
        description="Finished goods, components, packaging, and raw materials. Structural changes may affect planning."
        actions={
          canWrite ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setDetail({ kind: "create" })}
              data-testid="new-item-btn"
            >
              + New item
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
            title={`${filtered.length} item${filtered.length === 1 ? "" : "s"}`}
            description="Click a row to open the edit panel."
          >
            <div className="mb-3">
              <SearchFilterBar
                query={query}
                onQueryChange={setQuery}
                placeholder="Search by SKU or name…"
                chips={[
                  ...ITEM_KINDS.map<{
                    key: string;
                    label: string;
                    active: boolean;
                    onToggle: () => void;
                  }>((k) => ({
                    key: k,
                    label: k.replace("_", " "),
                    active: kindFilter === k,
                    onToggle: () => setKindFilter((cur) => (cur === k ? null : k)),
                  })),
                  {
                    key: "archived",
                    label: includeArchived ? "archived: on" : "archived: off",
                    active: includeArchived,
                    onToggle: () => setIncludeArchived((v) => !v),
                  },
                ]}
              />
            </div>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-fg-subtle">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-fg-subtle">
                No items match the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Name</th>
                      <th>Kind</th>
                      <th>Supply</th>
                      <th className="text-right">Reorder</th>
                      <th className="text-right">Target</th>
                      <th className="text-right">Lead</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((i) => (
                      <tr
                        key={i.id}
                        className="cursor-pointer"
                        onClick={() => setDetail({ kind: "edit", id: i.id })}
                      >
                        <td className="font-mono text-xs">{i.sku}</td>
                        <td>
                          <div className="font-medium">{i.name}</div>
                          {i.name_local ? (
                            <div className="text-2xs text-fg-muted">{i.name_local}</div>
                          ) : null}
                        </td>
                        <td>
                          <Badge tone="neutral">{i.kind.replace("_", " ")}</Badge>
                        </td>
                        <td className="text-xs">{i.supply_method}</td>
                        <td className="text-right font-mono tabular-nums">
                          {i.reorder_point ?? "—"}
                        </td>
                        <td className="text-right font-mono tabular-nums">
                          {i.target_stock ?? "—"}
                        </td>
                        <td className="text-right font-mono tabular-nums">
                          {i.lead_time_days != null ? `${i.lead_time_days}d` : "—"}
                        </td>
                        <td>
                          {i.audit.active ? (
                            <Badge tone="success">active</Badge>
                          ) : (
                            <Badge tone="neutral">archived</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        }
        detail={
          detail.kind === "closed" ? null : (
            <ItemDetailPanel
              mode={detail}
              item={selected}
              onClose={() => setDetail({ kind: "closed" })}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["items"] });
              }}
            />
          )
        }
      />
    </>
  );
}

interface ItemDetailPanelProps {
  mode: DetailMode;
  item: ItemDto | null;
  onClose: () => void;
  onSaved: () => void;
}

function ItemDetailPanel({ mode, item, onClose, onSaved }: ItemDetailPanelProps) {
  const canWrite = useHasRole("admin");
  const isCreate = mode.kind === "create";
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: item
      ? {
          sku: item.sku,
          name: item.name,
          name_local: item.name_local,
          kind: item.kind,
          supply_method: item.supply_method,
          default_uom: item.default_uom,
          min_stock: item.min_stock,
          reorder_point: item.reorder_point,
          target_stock: item.target_stock,
          lead_time_days: item.lead_time_days,
          notes: item.notes,
        }
      : {
          sku: "",
          name: "",
          kind: "finished_good",
          supply_method: "MAKE",
          default_uom: "bottle",
        },
  });

  const createMut = useMutation({
    mutationFn: async (v: ItemFormValues) =>
      itemsRepo.create({
        ...v,
        allowed_uoms: [v.default_uom as Uom],
      } as Omit<ItemDto, "id" | "audit">),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const updateMut = useMutation({
    mutationFn: async (v: ItemFormValues) => {
      if (!item) throw new Error("no item");
      return itemsRepo.update(
        item.id,
        {
          ...v,
          allowed_uoms: [v.default_uom as Uom],
        } as Partial<ItemDto>,
        item.audit.version
      );
    },
    onSuccess: () => {
      onSaved();
    },
  });

  const archiveMut = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error("no item");
      return itemsRepo.setActive(item.id, !item.audit.active);
    },
    onSuccess: () => {
      onSaved();
    },
  });

  const issues: ValidationIssue[] = Object.entries(errors).map(([field, err]) => ({
    field,
    message: (err as { message?: string })?.message ?? "invalid",
    level: "blocker",
  }));

  return (
    <SectionCard
      title={isCreate ? "New item" : item?.name ?? "Item"}
      description={isCreate ? "Create a new item. SKU must be unique." : item?.sku}
      actions={
        <button type="button" className="btn btn-ghost text-xs" onClick={onClose}>
          Close
        </button>
      }
    >
      <form
        onSubmit={handleSubmit((v) =>
          isCreate ? createMut.mutate(v) : updateMut.mutate(v)
        )}
        className="space-y-4"
      >
        {issues.length > 0 ? <ValidationSummary issues={issues} /> : null}
        <FieldGrid columns={2}>
          <Field label="SKU" required error={errors.sku?.message}>
            <input
              className="input font-mono"
              data-testid="item-sku-input"
              {...register("sku")}
            />
          </Field>
          <Field label="Name" required error={errors.name?.message}>
            <input
              className="input"
              data-testid="item-name-input"
              {...register("name")}
            />
          </Field>
          <Field label="Local name (Hebrew)" span={2}>
            <input className="input" dir="auto" {...register("name_local")} />
          </Field>
          <Field label="Kind" required>
            <select className="input" {...register("kind")}>
              {ITEM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Supply method" required>
            <select className="input" {...register("supply_method")}>
              {SUPPLY_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default UoM" required>
            <select className="input" {...register("default_uom")}>
              {UOMS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lead time (days)">
            <input type="number" min="0" className="input" {...register("lead_time_days")} />
          </Field>
          <Field label="Min stock">
            <input type="number" min="0" className="input" {...register("min_stock")} />
          </Field>
          <Field label="Reorder point">
            <input type="number" min="0" className="input" {...register("reorder_point")} />
          </Field>
          <Field label="Target stock">
            <input type="number" min="0" className="input" {...register("target_stock")} />
          </Field>
          <Field label="Notes" span={2}>
            <textarea className="textarea" {...register("notes")} />
          </Field>
        </FieldGrid>

        {!isCreate && item ? (
          <details className="rounded-md border border-border bg-bg-subtle p-3">
            <summary className="cursor-pointer text-xs font-medium text-fg-muted">
              Audit
            </summary>
            <div className="mt-2">
              <AuditSnippet audit={item.audit} />
            </div>
          </details>
        ) : null}

        <FormActionsBar
          hint={
            !canWrite
              ? "Read-only for planner role. Switch to admin in the top-bar fake session to edit."
              : isCreate
                ? "Creating a new master record."
                : "Structural changes are versioned; optimistic concurrency applies."
          }
          secondary={
            canWrite && !isCreate && item ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (confirm(`${item.audit.active ? "Archive" : "Reactivate"} ${item.name}?`)) {
                    archiveMut.mutate();
                  }
                }}
              >
                {item.audit.active ? "Archive" : "Reactivate"}
              </button>
            ) : canWrite ? (
              <button type="button" className="btn" onClick={() => reset()}>
                Reset
              </button>
            ) : null
          }
          primary={
            canWrite ? (
              <button type="submit" className="btn btn-primary" disabled={isSubmitting} data-testid="save-item-btn">
                {isCreate ? "Create item" : "Save changes"}
              </button>
            ) : null
          }
        />
      </form>
    </SectionCard>
  );
}
