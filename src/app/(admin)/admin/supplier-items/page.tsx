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
import { componentsRepo, suppliersRepo, supplierItemsRepo } from "@/lib/repositories";
import { UOMS } from "@/lib/contracts/enums";
import type { SupplierItemDto } from "@/lib/contracts/dto";

const QUALITY = ["confirmed", "probable", "unmapped"] as const;

const schema = z.object({
  supplier_id: z.string().min(1, "Choose a supplier"),
  component_id: z.string().min(1, "Choose a component"),
  supplier_sku: z.string().optional(),
  pack_size: z.coerce.number().positive().optional(),
  pack_unit: z.enum(UOMS).optional(),
  price_amount: z.coerce.number().positive().optional(),
  price_currency: z.string().length(3).optional(),
  price_unit: z.enum(UOMS).optional(),
  preferred: z.coerce.boolean().optional(),
  mapping_quality: z.enum(QUALITY),
});
type FormValues = z.infer<typeof schema>;

type DetailMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; id: string };

export default function SupplierItemsAdminPage() {
  const canWrite = useHasRole("admin");
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [qualityFilter, setQualityFilter] = useState<(typeof QUALITY)[number] | null>(null);
  const [detail, setDetail] = useState<DetailMode>({ kind: "closed" });

  const { data: rows = [] } = useQuery({
    queryKey: ["supplier-items", query],
    queryFn: () => supplierItemsRepo.list({ query }),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-for-si"],
    queryFn: () => suppliersRepo.list(),
  });
  const { data: components = [] } = useQuery({
    queryKey: ["components-for-si"],
    queryFn: () => componentsRepo.list(),
  });

  const filtered = useMemo(
    () => (qualityFilter ? rows.filter((r) => r.mapping_quality === qualityFilter) : rows),
    [rows, qualityFilter]
  );

  const selected =
    detail.kind === "edit" ? rows.find((r) => r.id === detail.id) ?? null : null;

  return (
    <>
      <WorkflowHeader
        eyebrow="Master data"
        title="Supplier ↔ Component mapping"
        description="Mapping quality gates Green Invoice auto price updates. Unmapped = no auto-update."
        actions={
          canWrite ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setDetail({ kind: "create" })}
            >
              + New mapping
            </button>
          ) : (
            <Badge tone="neutral">read-only for planner</Badge>
          )
        }
      />

      <SplitListLayout
        isDetailOpen={detail.kind !== "closed"}
        list={
          <SectionCard title={`${filtered.length} mapping${filtered.length === 1 ? "" : "s"}`}>
            <div className="mb-3">
              <SearchFilterBar
                query={query}
                onQueryChange={setQuery}
                placeholder="Search supplier, component, supplier SKU…"
                chips={QUALITY.map((q) => ({
                  key: q,
                  label: q,
                  active: qualityFilter === q,
                  onToggle: () => setQualityFilter((c) => (c === q ? null : q)),
                }))}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Component</th>
                    <th>Supplier SKU</th>
                    <th className="text-right">Pack</th>
                    <th className="text-right">Price</th>
                    <th>Preferred</th>
                    <th>Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => setDetail({ kind: "edit", id: r.id })}
                    >
                      <td className="text-xs">{r.supplier_name}</td>
                      <td className="text-xs font-medium">{r.component_name}</td>
                      <td className="font-mono text-2xs">{r.supplier_sku ?? "—"}</td>
                      <td className="text-right text-2xs">
                        {r.pack_size && r.pack_unit
                          ? `${r.pack_size} ${r.pack_unit}`
                          : "—"}
                      </td>
                      <td className="text-right font-mono tabular-nums">
                        {r.active_price
                          ? `${r.active_price.amount.toFixed(2)} ${r.active_price.currency}/${r.active_price.unit}`
                          : "—"}
                      </td>
                      <td>
                        {r.preferred ? <Badge tone="accent">preferred</Badge> : null}
                      </td>
                      <td>
                        <Badge
                          tone={
                            r.mapping_quality === "confirmed"
                              ? "success"
                              : r.mapping_quality === "probable"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {r.mapping_quality}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        }
        detail={
          detail.kind === "closed" ? null : (
            <SupplierItemDetailPanel
              mode={detail}
              current={selected}
              suppliers={suppliers}
              components={components}
              onClose={() => setDetail({ kind: "closed" })}
              onSaved={() => qc.invalidateQueries({ queryKey: ["supplier-items"] })}
            />
          )
        }
      />
    </>
  );
}

function SupplierItemDetailPanel({
  mode,
  current,
  suppliers,
  components,
  onClose,
  onSaved,
}: {
  mode: DetailMode;
  current: SupplierItemDto | null;
  suppliers: { id: string; name: string }[];
  components: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const canWrite = useHasRole("admin");
  const isCreate = mode.kind === "create";
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: current
      ? {
          supplier_id: current.supplier_id,
          component_id: current.component_id,
          supplier_sku: current.supplier_sku,
          pack_size: current.pack_size,
          pack_unit: current.pack_unit,
          price_amount: current.active_price?.amount,
          price_currency: current.active_price?.currency,
          price_unit: current.active_price?.unit,
          preferred: current.preferred,
          mapping_quality: current.mapping_quality,
        }
      : { mapping_quality: "unmapped", preferred: false, supplier_id: "", component_id: "" },
  });

  const buildDto = (v: FormValues, base: Partial<SupplierItemDto>) => {
    const supplier = suppliers.find((s) => s.id === v.supplier_id);
    const component = components.find((c) => c.id === v.component_id);
    return {
      ...base,
      supplier_id: v.supplier_id,
      supplier_name: supplier?.name ?? "",
      component_id: v.component_id,
      component_name: component?.name ?? "",
      supplier_sku: v.supplier_sku,
      pack_size: v.pack_size,
      pack_unit: v.pack_unit,
      active_price:
        v.price_amount && v.price_currency && v.price_unit
          ? {
              amount: v.price_amount,
              currency: v.price_currency,
              unit: v.price_unit,
            }
          : undefined,
      preferred: !!v.preferred,
      mapping_quality: v.mapping_quality,
    } as Partial<SupplierItemDto>;
  };

  const createMut = useMutation({
    mutationFn: (v: FormValues) =>
      supplierItemsRepo.create(buildDto(v, {}) as Omit<SupplierItemDto, "id" | "audit">),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const updateMut = useMutation({
    mutationFn: (v: FormValues) =>
      supplierItemsRepo.update(current!.id, buildDto(v, {}), current!.audit.version),
    onSuccess: () => onSaved(),
  });

  const issues: ValidationIssue[] = Object.entries(errors).map(([f, e]) => ({
    field: f,
    message: (e as { message?: string })?.message ?? "invalid",
    level: "blocker",
  }));

  return (
    <SectionCard
      title={isCreate ? "New mapping" : `${current?.supplier_name} → ${current?.component_name}`}
      actions={
        <button type="button" className="btn btn-ghost text-xs" onClick={onClose}>
          Close
        </button>
      }
    >
      <form
        onSubmit={handleSubmit((v) => (isCreate ? createMut.mutate(v) : updateMut.mutate(v)))}
        className="space-y-4"
      >
        {issues.length > 0 ? <ValidationSummary issues={issues} /> : null}
        <FieldGrid columns={2}>
          <Field label="Supplier" required error={errors.supplier_id?.message} span={2}>
            <select className="input" {...register("supplier_id")}>
              <option value="">— select —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Component" required error={errors.component_id?.message} span={2}>
            <select className="input" {...register("component_id")}>
              <option value="">— select —</option>
              {components.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Supplier SKU">
            <input className="input font-mono" {...register("supplier_sku")} />
          </Field>
          <Field label="Pack size">
            <input type="number" step="0.001" className="input" {...register("pack_size")} />
          </Field>
          <Field label="Pack unit">
            <select className="input" {...register("pack_unit")}>
              <option value="">—</option>
              {UOMS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Price amount">
            <input type="number" step="0.0001" className="input" {...register("price_amount")} />
          </Field>
          <Field label="Price currency">
            <input className="input uppercase" placeholder="ILS" {...register("price_currency")} />
          </Field>
          <Field label="Price unit">
            <select className="input" {...register("price_unit")}>
              <option value="">—</option>
              {UOMS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mapping quality" required>
            <select className="input" {...register("mapping_quality")}>
              {QUALITY.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Preferred supplier for this component">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("preferred")} />
              Use as default
            </label>
          </Field>
        </FieldGrid>

        {!isCreate && current ? (
          <details className="rounded-md border border-border bg-bg-subtle p-3">
            <summary className="cursor-pointer text-xs font-medium text-fg-muted">Audit</summary>
            <div className="mt-2">
              <AuditSnippet audit={current.audit} />
            </div>
          </details>
        ) : null}

        <FormActionsBar
          hint={
            canWrite
              ? "Only 'confirmed' mappings allow Green Invoice active-price auto-update."
              : "Read-only for planner role."
          }
          primary={
            canWrite ? (
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isCreate ? "Create mapping" : "Save changes"}
              </button>
            ) : null
          }
        />
      </form>
    </SectionCard>
  );
}
