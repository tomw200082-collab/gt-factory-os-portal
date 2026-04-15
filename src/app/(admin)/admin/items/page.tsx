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
import {
  ValidationSummary,
  type ValidationIssue,
} from "@/components/workflow/ValidationSummary";
import { AuditSnippet } from "@/components/data/AuditSnippet";
import { SearchFilterBar } from "@/components/data/SearchFilterBar";
import { Badge } from "@/components/badges/StatusBadge";
import { SplitListLayout } from "@/features/master-data/SplitListLayout";
import { useHasRole } from "@/lib/auth/role-gate";
import { itemsRepo } from "@/lib/repositories";
import {
  ITEM_STATUSES,
  SUPPLY_METHODS,
  UOMS,
  type SupplyMethod,
} from "@/lib/contracts/enums";
import type { ItemDto } from "@/lib/contracts/dto";

// ---------------------------------------------------------------------------
// Items admin — reconciled for Phase A.
//
// Matches the locked ItemDto shape from 0002_masters.sql. Drops the
// pre-Phase-A `kind: ItemKind` discriminator (not in the schema) and
// the `sku` / `name` / `default_uom` / `allowed_uoms` / `min_stock`
// / `reorder_point` / `target_stock` / `active_bom_id` columns (none
// of which are in the locked items table).
//
// CRITICAL C3 CONSTRAINT — pinned from the C3 sandbox doctrine and
// from Phase A brief §6 T4:
//
//   primary_bom_head_id, base_bom_head_id, and base_fill_qty_per_unit
//   are DISPLAY-ONLY on this screen. D4 / Phase A Master Maintenance
//   must not become a BOM editor. BOM wiring lives in
//   0003_bom_three_table.sql and has its own separate maintenance
//   module (admin/boms/page.tsx). If these fields ever gain an
//   editable control on this page, the Phase A brief's BOM-display-
//   only doctrine has been violated and must be restored before
//   merge.
//
// See the three Field components marked BOM_DISPLAY_ONLY below for
// the exact implementation. They render the current value inside a
// SectionCard sub-panel with no write handler.
// ---------------------------------------------------------------------------

const itemSchema = z.object({
  item_id: z.string().min(2, "Item ID is required."),
  item_name: z.string().min(2, "Item name is required."),
  family: z.string().optional(),
  pack_size: z.string().optional(),
  // Preprocess empty string -> undefined so an unchosen '—' option
  // from the dropdown passes .optional() rather than failing the
  // enum check with 'Invalid enum value ... received '''.
  sales_uom: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(UOMS).optional(),
  ),
  sweetness: z.string().optional(),
  supply_method: z.enum(SUPPLY_METHODS),
  item_type: z.string().optional(),
  status: z.enum(ITEM_STATUSES),
  barcode: z.string().optional(),
  legacy_sku: z.string().optional(),
  // Optional numeric fields: preprocess empty strings to undefined so
  // .coerce.number() does not turn "" into 0 and trip .positive()
  // silently. react-hook-form sends "" for untouched <input type=
  // "number"> fields; zod's default .optional() allows undefined but
  // does not treat "" as absent. This was the submit-silently-fails
  // bug caught by the Phase A admin-items-crud E2E regression in
  // Wave 5b.
  shelf_life_days: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().nonnegative().optional(),
  ),
  storage: z.string().optional(),
  case_pack: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
  sub_type: z.string().optional(),
  product_group: z.string().optional(),
  notes: z.string().optional(),
  // Deliberately NO primary_bom_head_id / base_bom_head_id /
  // base_fill_qty_per_unit fields in the form schema. BOM wiring is
  // read-only on this screen.
});
type ItemFormValues = z.infer<typeof itemSchema>;

type DetailMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; id: string };

export default function ItemsAdminPage() {
  const canWrite = useHasRole("admin");
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [supplyFilter, setSupplyFilter] = useState<SupplyMethod | null>(null);
  const [detail, setDetail] = useState<DetailMode>({ kind: "closed" });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["items", query, includeArchived],
    queryFn: () => itemsRepo.list({ query, includeArchived }),
  });

  const filtered = useMemo(
    () =>
      supplyFilter
        ? items.filter((i) => i.supply_method === supplyFilter)
        : items,
    [items, supplyFilter],
  );

  const selected =
    detail.kind === "edit"
      ? (items.find((i) => i.item_id === detail.id) ?? null)
      : null;

  return (
    <>
      <WorkflowHeader
        eyebrow="Master data"
        title="Items"
        description="Finished goods — manufactured, bought-finished, and repack. BOM wiring is display-only on this screen (managed in the BOMs admin)."
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
                placeholder="Search by item ID, name, or family…"
                chips={[
                  ...SUPPLY_METHODS.map<{
                    key: string;
                    label: string;
                    active: boolean;
                    onToggle: () => void;
                  }>((m) => ({
                    key: m,
                    label: m,
                    active: supplyFilter === m,
                    onToggle: () =>
                      setSupplyFilter((cur) => (cur === m ? null : m)),
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
              <div className="py-8 text-center text-sm text-fg-subtle">
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-fg-subtle">
                No items match the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Item ID</th>
                      <th>Name</th>
                      <th>Family</th>
                      <th>Pack</th>
                      <th>Supply method</th>
                      <th>Status</th>
                      <th>Archive</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((i) => (
                      <tr
                        key={i.item_id}
                        className="cursor-pointer"
                        onClick={() =>
                          setDetail({ kind: "edit", id: i.item_id })
                        }
                      >
                        <td className="font-mono text-xs">{i.item_id}</td>
                        <td>
                          <div className="font-medium" dir="auto">
                            {i.item_name}
                          </div>
                          {i.notes ? (
                            <div className="text-2xs text-fg-muted" dir="auto">
                              {i.notes}
                            </div>
                          ) : null}
                        </td>
                        <td className="text-xs">{i.family ?? "—"}</td>
                        <td className="text-xs">
                          {i.pack_size ? (
                            <span className="font-mono">{i.pack_size}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="text-xs">
                          <Badge tone="neutral">{i.supply_method}</Badge>
                        </td>
                        <td>
                          {i.status === "ACTIVE" ? (
                            <Badge tone="success">ACTIVE</Badge>
                          ) : i.status === "PENDING" ? (
                            <Badge tone="warning">PENDING</Badge>
                          ) : (
                            <Badge tone="neutral">INACTIVE</Badge>
                          )}
                        </td>
                        <td className="text-xs">
                          {i.audit.active ? (
                            <span className="text-fg-subtle">—</span>
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

function ItemDetailPanel({
  mode,
  item,
  onClose,
  onSaved,
}: ItemDetailPanelProps) {
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
          item_id: item.item_id,
          item_name: item.item_name,
          family: item.family ?? undefined,
          pack_size: item.pack_size ?? undefined,
          sales_uom: item.sales_uom ?? undefined,
          sweetness: item.sweetness ?? undefined,
          supply_method: item.supply_method,
          item_type: item.item_type ?? undefined,
          status: item.status,
          barcode: item.barcode ?? undefined,
          legacy_sku: item.legacy_sku ?? undefined,
          shelf_life_days: item.shelf_life_days ?? undefined,
          storage: item.storage ?? undefined,
          case_pack: item.case_pack ?? undefined,
          sub_type: item.sub_type ?? undefined,
          product_group: item.product_group ?? undefined,
          notes: item.notes ?? undefined,
        }
      : {
          item_id: "",
          item_name: "",
          supply_method: "MANUFACTURED",
          status: "PENDING",
        },
  });

  const formValuesToDto = (v: ItemFormValues): Partial<ItemDto> => ({
    item_name: v.item_name,
    family: v.family ?? null,
    pack_size: v.pack_size ?? null,
    sales_uom: v.sales_uom ?? null,
    sweetness: v.sweetness ?? null,
    supply_method: v.supply_method,
    item_type: v.item_type ?? null,
    status: v.status,
    barcode: v.barcode ?? null,
    legacy_sku: v.legacy_sku ?? null,
    shelf_life_days: v.shelf_life_days ?? null,
    storage: v.storage ?? null,
    case_pack: v.case_pack ?? null,
    sub_type: v.sub_type ?? null,
    product_group: v.product_group ?? null,
    notes: v.notes ?? null,
  });

  const createMut = useMutation({
    mutationFn: async (v: ItemFormValues) =>
      itemsRepo.create({
        item_id: v.item_id,
        ...formValuesToDto(v),
        // New items start with no BOM wiring. The BOMs admin module is
        // responsible for attaching bom_head refs later.
        primary_bom_head_id: null,
        base_bom_head_id: null,
        base_fill_qty_per_unit: null,
        site_id: "GT-MAIN",
      } as Omit<ItemDto, "audit">),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const updateMut = useMutation({
    mutationFn: async (v: ItemFormValues) => {
      if (!item) throw new Error("no item");
      return itemsRepo.update(
        item.item_id,
        formValuesToDto(v),
        item.audit.version,
      );
    },
    onSuccess: () => {
      onSaved();
    },
  });

  const archiveMut = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error("no item");
      return itemsRepo.setActive(item.item_id, !item.audit.active);
    },
    onSuccess: () => {
      onSaved();
    },
  });

  const issues: ValidationIssue[] = Object.entries(errors).map(
    ([field, err]) => ({
      field,
      message: (err as { message?: string })?.message ?? "invalid",
      level: "blocker",
    }),
  );

  return (
    <SectionCard
      title={isCreate ? "New item" : (item?.item_name ?? "Item")}
      description={
        isCreate ? "Create a new item. Item ID must be unique." : item?.item_id
      }
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
      <form
        onSubmit={handleSubmit((v) =>
          isCreate ? createMut.mutate(v) : updateMut.mutate(v),
        )}
        className="space-y-4"
      >
        {issues.length > 0 ? <ValidationSummary issues={issues} /> : null}
        <FieldGrid columns={2}>
          <Field
            label="Item ID"
            required
            error={errors.item_id?.message}
          >
            <input
              className="input font-mono"
              data-testid="item-id-input"
              {...register("item_id")}
              readOnly={!isCreate}
            />
          </Field>
          <Field label="Status" required>
            <select className="input" {...register("status")}>
              {ITEM_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Item name"
            required
            error={errors.item_name?.message}
            span={2}
          >
            <input
              className="input"
              dir="auto"
              data-testid="item-name-input"
              {...register("item_name")}
            />
          </Field>
          <Field label="Family">
            <input className="input" {...register("family")} />
          </Field>
          <Field label="Product group">
            <input className="input" {...register("product_group")} />
          </Field>
          <Field label="Sub type">
            <input className="input" {...register("sub_type")} />
          </Field>
          <Field
            label="Item type (free-text)"
            hint="Legacy metadata, see DQ-007 in 0002_masters.sql."
          >
            <input className="input" {...register("item_type")} />
          </Field>
          <Field label="Pack size">
            <input
              className="input font-mono"
              placeholder="e.g. 450ML"
              {...register("pack_size")}
            />
          </Field>
          <Field label="Sweetness">
            <input
              className="input"
              placeholder="e.g. REGULAR"
              {...register("sweetness")}
            />
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
          <Field label="Sales UOM">
            <select className="input" {...register("sales_uom")}>
              <option value="">—</option>
              {UOMS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Case pack">
            <input
              type="number"
              min="1"
              className="input"
              {...register("case_pack")}
            />
          </Field>
          <Field label="Shelf life (days)">
            <input
              type="number"
              min="0"
              className="input"
              {...register("shelf_life_days")}
            />
          </Field>
          <Field label="Storage">
            <input
              className="input"
              placeholder="e.g. AMBIENT / CHILLED"
              {...register("storage")}
            />
          </Field>
          <Field label="Barcode">
            <input className="input font-mono" {...register("barcode")} />
          </Field>
          <Field label="Legacy SKU">
            <input className="input font-mono" {...register("legacy_sku")} />
          </Field>
          <Field label="Notes" span={2}>
            <textarea className="textarea" dir="auto" {...register("notes")} />
          </Field>
        </FieldGrid>

        {/*
          BOM_DISPLAY_ONLY — pinned by Phase A brief §6 T4.
          These three values come from the ItemDto but are rendered as
          read-only text. Master Maintenance must NOT become a BOM
          editor; BOM wiring lives in admin/boms/page.tsx and the
          locked 0003_bom_three_table.sql migration.
        */}
        {item && (item.primary_bom_head_id ||
          item.base_bom_head_id ||
          item.base_fill_qty_per_unit != null) ? (
          <div
            className="rounded-md border border-border bg-bg-subtle p-3"
            data-testid="bom-wiring-readonly"
          >
            <div className="text-2xs font-semibold uppercase tracking-sops text-fg-muted">
              BOM wiring (read-only)
            </div>
            <div className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
              <div className="text-fg-muted">Primary BOM head</div>
              <div className="font-mono">
                {item.primary_bom_head_id ?? "—"}
              </div>
              <div className="text-fg-muted">Base BOM head</div>
              <div className="font-mono">
                {item.base_bom_head_id ?? "—"}
              </div>
              <div className="text-fg-muted">Base fill qty / unit</div>
              <div className="font-mono tabular-nums">
                {item.base_fill_qty_per_unit ?? "—"}
              </div>
            </div>
            <div className="mt-2 text-2xs text-fg-subtle">
              BOM wiring is managed in the BOMs admin screen, not here.
            </div>
          </div>
        ) : null}

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
              ? "Read-only for planner role."
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
                  if (
                    confirm(
                      `${item.audit.active ? "Archive" : "Reactivate"} ${item.item_name}?`,
                    )
                  ) {
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
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
                data-testid="save-item-btn"
              >
                {isCreate ? "Create item" : "Save changes"}
              </button>
            ) : null
          }
        />
      </form>
    </SectionCard>
  );
}
