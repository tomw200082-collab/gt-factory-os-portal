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
import { componentsRepo, suppliersRepo } from "@/lib/repositories";
import { UOMS } from "@/lib/contracts/enums";
import type { ComponentDto } from "@/lib/contracts/dto";

const KINDS = ["component", "raw_material", "packaging"] as const;

const schema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  name_local: z.string().optional(),
  kind: z.enum(KINDS),
  default_uom: z.enum(UOMS),
  density_kg_per_l: z.coerce.number().positive().optional(),
  primary_supplier_id: z.string().optional(),
  lead_time_days: z.coerce.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

type DetailMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; id: string };

export default function ComponentsAdminPage() {
  const canWrite = useHasRole("admin");
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<(typeof KINDS)[number] | null>(null);
  const [detail, setDetail] = useState<DetailMode>({ kind: "closed" });

  const { data: components = [] } = useQuery({
    queryKey: ["components", query],
    queryFn: () => componentsRepo.list({ query }),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-for-components"],
    queryFn: () => suppliersRepo.list(),
  });

  const filtered = useMemo(
    () => (kindFilter ? components.filter((c) => c.kind === kindFilter) : components),
    [components, kindFilter]
  );

  const selected =
    detail.kind === "edit" ? components.find((c) => c.id === detail.id) ?? null : null;

  return (
    <>
      <WorkflowHeader
        eyebrow="Master data"
        title="Components"
        description="Raw materials, packaging, and sub-components consumed by BOMs."
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
                placeholder="Search by code or name…"
                chips={KINDS.map((k) => ({
                  key: k,
                  label: k.replace("_", " "),
                  active: kindFilter === k,
                  onToggle: () => setKindFilter((cur) => (cur === k ? null : k)),
                }))}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Kind</th>
                    <th>UoM</th>
                    <th>Primary supplier</th>
                    <th className="text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const supplier = suppliers.find((s) => s.id === c.primary_supplier_id);
                    return (
                      <tr
                        key={c.id}
                        className="cursor-pointer"
                        onClick={() => setDetail({ kind: "edit", id: c.id })}
                      >
                        <td className="font-mono text-xs">{c.code}</td>
                        <td>
                          <div className="font-medium">{c.name}</div>
                          {c.name_local ? (
                            <div className="text-2xs text-fg-muted">{c.name_local}</div>
                          ) : null}
                        </td>
                        <td>
                          <Badge tone="neutral">{c.kind.replace("_", " ")}</Badge>
                        </td>
                        <td className="text-xs">{c.default_uom}</td>
                        <td className="text-xs text-fg-muted">{supplier?.name ?? "—"}</td>
                        <td className="text-right font-mono tabular-nums">
                          {c.active_price
                            ? `${c.active_price.amount.toFixed(2)} ${c.active_price.currency}`
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
              suppliers={suppliers}
              onClose={() => setDetail({ kind: "closed" })}
              onSaved={() => qc.invalidateQueries({ queryKey: ["components"] })}
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
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: current
      ? {
          code: current.code,
          name: current.name,
          name_local: current.name_local,
          kind: current.kind,
          default_uom: current.default_uom,
          density_kg_per_l: current.density_kg_per_l,
          primary_supplier_id: current.primary_supplier_id,
          lead_time_days: current.lead_time_days,
          notes: current.notes,
        }
      : { code: "", name: "", kind: "component", default_uom: "kg" },
  });

  const createMut = useMutation({
    mutationFn: (v: FormValues) =>
      componentsRepo.create(v as Omit<ComponentDto, "id" | "audit">),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const updateMut = useMutation({
    mutationFn: (v: FormValues) =>
      componentsRepo.update(current!.id, v as Partial<ComponentDto>, current!.audit.version),
    onSuccess: () => onSaved(),
  });
  const archiveMut = useMutation({
    mutationFn: () => componentsRepo.setActive(current!.id, !current!.audit.active),
    onSuccess: () => onSaved(),
  });

  const issues: ValidationIssue[] = Object.entries(errors).map(([f, e]) => ({
    field: f,
    message: (e as { message?: string })?.message ?? "invalid",
    level: "blocker",
  }));

  return (
    <SectionCard
      title={isCreate ? "New component" : current?.name ?? "Component"}
      description={isCreate ? undefined : current?.code}
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
          <Field label="Code" required error={errors.code?.message}>
            <input className="input font-mono" {...register("code")} />
          </Field>
          <Field label="Name" required error={errors.name?.message}>
            <input className="input" {...register("name")} />
          </Field>
          <Field label="Local name (Hebrew)" span={2}>
            <input className="input" dir="auto" {...register("name_local")} />
          </Field>
          <Field label="Kind" required>
            <select className="input" {...register("kind")}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace("_", " ")}
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
          <Field label="Lead time (days)">
            <input type="number" min="0" className="input" {...register("lead_time_days")} />
          </Field>
          <Field label="Density (kg/L)" hint="Only required for liquids used across mass/volume units.">
            <input type="number" step="0.001" className="input" {...register("density_kg_per_l")} />
          </Field>
          <Field label="Notes" span={2}>
            <textarea className="textarea" {...register("notes")} />
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
                  if (confirm(`${current.audit.active ? "Archive" : "Reactivate"} ${current.name}?`)) {
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
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isCreate ? "Create component" : "Save changes"}
              </button>
            ) : null
          }
        />
      </form>
    </SectionCard>
  );
}
