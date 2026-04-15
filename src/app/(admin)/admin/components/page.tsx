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
import { componentsRepo, suppliersRepo } from "@/lib/repositories";
import { COMPONENT_STATUSES, UOMS } from "@/lib/contracts/enums";
import type { ComponentDto } from "@/lib/contracts/dto";

// ---------------------------------------------------------------------------
// Components admin — reconciled for Phase A.
//
// Matches the locked ComponentDto shape from 0002_masters.sql.
//
// The previous draft had a `kind: "component"|"raw_material"|"packaging"`
// discriminator that does not exist in the locked schema. Component
// categorisation is expressed via component_class (e.g. INGREDIENT,
// PACKAGING, ADDITIVE) + component_group (e.g. ALCOHOL, BOTTLE) — both
// free-text metadata, filtered client-side. That preserves the
// browse-by-class UX without inventing an enum the DB does not model.
//
// Density (density_kg_per_l) was dropped in Wave 1 as part of the
// locked schema migration — if it reappears it lands as an explicit
// per-component physical conversion (locked decision 12), not as a
// naked column here.
// ---------------------------------------------------------------------------

const schema = z.object({
  component_id: z.string().min(2, "Component ID is required."),
  component_name: z.string().min(2, "Component name is required."),
  component_class: z.string().optional(),
  component_group: z.string().optional(),
  status: z.enum(COMPONENT_STATUSES),
  // Preprocess empty string -> undefined so unchosen '—' options from
  // the enum dropdowns and untouched <input type="number"> fields pass
  // .optional() rather than failing the enum/coerce check. Same pattern
  // applied across all Wave 3 admin create forms (see items/page.tsx).
  inventory_uom: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(UOMS).optional(),
  ),
  purchase_uom: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(UOMS).optional(),
  ),
  bom_uom: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(UOMS).optional(),
  ),
  purchase_to_inv_factor: z.coerce.number().positive().default(1),
  planning_policy_code: z.string().optional(),
  primary_supplier_id: z.string().optional(),
  lead_time_days: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().nonnegative().optional(),
  ),
  moq_purchase_uom: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().nonnegative().optional(),
  ),
  order_multiple_purchase_uom: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().nonnegative().optional(),
  ),
  std_cost_per_purchase_uom: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().nonnegative().optional(),
  ),
  std_cost_per_inv_uom: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().nonnegative().optional(),
  ),
  criticality: z.string().optional(),
  planned_flag: z.boolean().default(true),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

type DetailMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; id: string };

export default function ComponentsAdminPage() {
  const canWrite = useHasRole("admin");
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailMode>({ kind: "closed" });

  const { data: components = [] } = useQuery({
    queryKey: ["components", query],
    queryFn: () => componentsRepo.list({ query }),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-for-components"],
    queryFn: () => suppliersRepo.list(),
  });

  // Derive the distinct component_class values from the live data so
  // filter chips match whatever the fixtures actually contain.
  const classChoices = useMemo(() => {
    const set = new Set<string>();
    for (const c of components) {
      if (c.component_class) set.add(c.component_class);
    }
    return Array.from(set).sort();
  }, [components]);

  const filtered = useMemo(
    () =>
      classFilter
        ? components.filter((c) => c.component_class === classFilter)
        : components,
    [components, classFilter],
  );

  const selected =
    detail.kind === "edit"
      ? (components.find((c) => c.component_id === detail.id) ?? null)
      : null;

  return (
    <>
      <WorkflowHeader
        eyebrow="Master data"
        title="Components"
        description="Raw materials, packaging, and sub-components consumed by BOMs. Categorisation via class + group (free-text metadata from the locked schema)."
        actions={
          canWrite ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setDetail({ kind: "create" })}
            >
              + New component
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
            title={`${filtered.length} component${filtered.length === 1 ? "" : "s"}`}
          >
            <div className="mb-3">
              <SearchFilterBar
                query={query}
                onQueryChange={setQuery}
                placeholder="Search by ID, name, class, or group…"
                chips={classChoices.map((k) => ({
                  key: k,
                  label: k,
                  active: classFilter === k,
                  onToggle: () =>
                    setClassFilter((cur) => (cur === k ? null : k)),
                }))}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Component ID</th>
                    <th>Name</th>
                    <th>Class / group</th>
                    <th>Inv UOM</th>
                    <th>Primary supplier</th>
                    <th className="text-right">Std cost / inv</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const supplier = suppliers.find(
                      (s) => s.supplier_id === c.primary_supplier_id,
                    );
                    return (
                      <tr
                        key={c.component_id}
                        className="cursor-pointer"
                        onClick={() =>
                          setDetail({ kind: "edit", id: c.component_id })
                        }
                      >
                        <td className="font-mono text-xs">{c.component_id}</td>
                        <td>
                          <div className="font-medium">{c.component_name}</div>
                          {c.notes ? (
                            <div className="text-2xs text-fg-muted" dir="auto">
                              {c.notes}
                            </div>
                          ) : null}
                        </td>
                        <td className="text-xs">
                          {c.component_class ? (
                            <Badge tone="neutral">{c.component_class}</Badge>
                          ) : (
                            "—"
                          )}
                          {c.component_group ? (
                            <div className="mt-0.5 text-2xs text-fg-muted">
                              {c.component_group}
                            </div>
                          ) : null}
                        </td>
                        <td className="text-xs">{c.inventory_uom ?? "—"}</td>
                        <td className="text-xs text-fg-muted" dir="auto">
                          {supplier?.supplier_name_official ?? "—"}
                        </td>
                        <td className="text-right font-mono tabular-nums">
                          {c.std_cost_per_inv_uom != null
                            ? c.std_cost_per_inv_uom.toFixed(2)
                            : "—"}
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
          detail.kind === "closed" ? null : (
            <ComponentDetailPanel
              mode={detail}
              current={selected}
              suppliers={suppliers.map((s) => ({
                id: s.supplier_id,
                name: s.supplier_name_official,
              }))}
              onClose={() => setDetail({ kind: "closed" })}
              onSaved={() =>
                qc.invalidateQueries({ queryKey: ["components"] })
              }
            />
          )
        }
      />
    </>
  );
}

function ComponentDetailPanel({
  mode,
  current,
  suppliers,
  onClose,
  onSaved,
}: {
  mode: DetailMode;
  current: ComponentDto | null;
  suppliers: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const canWrite = useHasRole("admin");
  const isCreate = mode.kind === "create";
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: current
      ? {
          component_id: current.component_id,
          component_name: current.component_name,
          component_class: current.component_class ?? undefined,
          component_group: current.component_group ?? undefined,
          status: current.status,
          inventory_uom: current.inventory_uom ?? undefined,
          purchase_uom: current.purchase_uom ?? undefined,
          bom_uom: current.bom_uom ?? undefined,
          purchase_to_inv_factor: current.purchase_to_inv_factor ?? 1,
          planning_policy_code: current.planning_policy_code ?? undefined,
          primary_supplier_id: current.primary_supplier_id ?? undefined,
          lead_time_days: current.lead_time_days ?? undefined,
          moq_purchase_uom: current.moq_purchase_uom ?? undefined,
          order_multiple_purchase_uom:
            current.order_multiple_purchase_uom ?? undefined,
          std_cost_per_purchase_uom:
            current.std_cost_per_purchase_uom ?? undefined,
          std_cost_per_inv_uom: current.std_cost_per_inv_uom ?? undefined,
          criticality: current.criticality ?? undefined,
          planned_flag: current.planned_flag,
          notes: current.notes ?? undefined,
        }
      : {
          component_id: "",
          component_name: "",
          status: "PENDING",
          purchase_to_inv_factor: 1,
          planned_flag: true,
        },
  });

  const formValuesToDto = (v: FormValues): Partial<ComponentDto> => ({
    component_name: v.component_name,
    component_class: v.component_class ?? null,
    component_group: v.component_group ?? null,
    status: v.status,
    inventory_uom: v.inventory_uom ?? null,
    purchase_uom: v.purchase_uom ?? null,
    bom_uom: v.bom_uom ?? null,
    purchase_to_inv_factor: v.purchase_to_inv_factor,
    planning_policy_code: v.planning_policy_code ?? null,
    primary_supplier_id: v.primary_supplier_id ?? null,
    lead_time_days: v.lead_time_days ?? null,
    moq_purchase_uom: v.moq_purchase_uom ?? null,
    order_multiple_purchase_uom: v.order_multiple_purchase_uom ?? null,
    std_cost_per_purchase_uom: v.std_cost_per_purchase_uom ?? null,
    std_cost_per_inv_uom: v.std_cost_per_inv_uom ?? null,
    criticality: v.criticality ?? null,
    planned_flag: v.planned_flag,
    notes: v.notes ?? null,
  });

  const createMut = useMutation({
    mutationFn: (v: FormValues) =>
      componentsRepo.create({
        component_id: v.component_id,
        ...formValuesToDto(v),
        site_id: "GT-MAIN",
      } as Omit<ComponentDto, "audit">),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const updateMut = useMutation({
    mutationFn: (v: FormValues) =>
      componentsRepo.update(
        current!.component_id,
        formValuesToDto(v),
        current!.audit.version,
      ),
    onSuccess: () => onSaved(),
  });
  const archiveMut = useMutation({
    mutationFn: () =>
      componentsRepo.setActive(
        current!.component_id,
        !current!.audit.active,
      ),
    onSuccess: () => onSaved(),
  });

  const issues: ValidationIssue[] = Object.entries(errors).map(([f, e]) => ({
    field: f,
    message: (e as { message?: string })?.message ?? "invalid",
    level: "blocker",
  }));

  return (
    <SectionCard
      title={isCreate ? "New component" : (current?.component_name ?? "Component")}
      description={isCreate ? undefined : current?.component_id}
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
            label="Component ID"
            required
            error={errors.component_id?.message}
          >
            <input
              className="input font-mono"
              {...register("component_id")}
              readOnly={!isCreate}
            />
          </Field>
          <Field label="Status" required>
            <select className="input" {...register("status")}>
              {COMPONENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Component name"
            required
            error={errors.component_name?.message}
            span={2}
          >
            <input
              className="input"
              dir="auto"
              {...register("component_name")}
            />
          </Field>
          <Field label="Class" hint="e.g. INGREDIENT, PACKAGING">
            <input className="input" {...register("component_class")} />
          </Field>
          <Field label="Group" hint="e.g. ALCOHOL, BOTTLE, LABEL">
            <input className="input" {...register("component_group")} />
          </Field>
          <Field label="Inventory UOM">
            <select className="input" {...register("inventory_uom")}>
              <option value="">—</option>
              {UOMS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Purchase UOM">
            <select className="input" {...register("purchase_uom")}>
              <option value="">—</option>
              {UOMS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          <Field label="BOM UOM">
            <select className="input" {...register("bom_uom")}>
              <option value="">—</option>
              {UOMS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Purchase → inventory factor"
            hint="Default. supplier_items.pack_conversion is authoritative per locked decision 12."
          >
            <input
              type="number"
              step="any"
              className="input"
              {...register("purchase_to_inv_factor")}
            />
          </Field>
          <Field label="Primary supplier">
            <select className="input" {...register("primary_supplier_id")}>
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Planning policy code">
            <input
              className="input"
              placeholder="e.g. MOQ_STANDARD"
              {...register("planning_policy_code")}
            />
          </Field>
          <Field label="Lead time (days)">
            <input
              type="number"
              min="0"
              className="input"
              {...register("lead_time_days")}
            />
          </Field>
          <Field label="MOQ (purchase UOM)">
            <input
              type="number"
              min="0"
              step="any"
              className="input"
              {...register("moq_purchase_uom")}
            />
          </Field>
          <Field label="Order multiple (purchase UOM)">
            <input
              type="number"
              min="0"
              step="any"
              className="input"
              {...register("order_multiple_purchase_uom")}
            />
          </Field>
          <Field label="Std cost / purchase UOM">
            <input
              type="number"
              min="0"
              step="any"
              className="input"
              {...register("std_cost_per_purchase_uom")}
            />
          </Field>
          <Field label="Std cost / inv UOM">
            <input
              type="number"
              min="0"
              step="any"
              className="input"
              {...register("std_cost_per_inv_uom")}
            />
          </Field>
          <Field label="Criticality">
            <input
              className="input"
              placeholder="e.g. HIGH"
              {...register("criticality")}
            />
          </Field>
          <Field label="Planned">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("planned_flag")} />
              <span>Include in planning runs</span>
            </label>
          </Field>
          <Field label="Notes" span={2}>
            <textarea className="textarea" dir="auto" {...register("notes")} />
          </Field>
        </FieldGrid>

        {!isCreate && current ? (
          <details className="rounded-md border border-border bg-bg-subtle p-3">
            <summary className="cursor-pointer text-xs font-medium text-fg-muted">
              Audit
            </summary>
            <div className="mt-2">
              <AuditSnippet audit={current.audit} />
            </div>
          </details>
        ) : null}

        <FormActionsBar
          hint={
            !canWrite
              ? "Read-only for planner role."
              : isCreate
                ? "Components become selectable on BOMs and supplier mappings."
                : "Price is managed via supplier-items and price history."
          }
          secondary={
            canWrite && !isCreate && current ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (
                    confirm(
                      `${current.audit.active ? "Archive" : "Reactivate"} ${current.component_name}?`,
                    )
                  ) {
                    archiveMut.mutate();
                  }
                }}
              >
                {current.audit.active ? "Archive" : "Reactivate"}
              </button>
            ) : null
          }
          primary={
            canWrite ? (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isCreate ? "Create component" : "Save changes"}
              </button>
            ) : null
          }
        />
      </form>
    </SectionCard>
  );
}
