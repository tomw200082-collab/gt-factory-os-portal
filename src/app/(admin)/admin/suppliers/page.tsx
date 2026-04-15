"use client";

import { useState } from "react";
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
import { suppliersRepo } from "@/lib/repositories";
import type { SupplierDto } from "@/lib/contracts/dto";

const schema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  name_local: z.string().optional(),
  contact_person: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  currency: z.string().min(3).max(3),
  payment_terms: z.string().optional(),
  lead_time_days: z.coerce.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

type DetailMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; id: string };

export default function SuppliersAdminPage() {
  const canWrite = useHasRole("admin");
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<DetailMode>({ kind: "closed" });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", query],
    queryFn: () => suppliersRepo.list({ query }),
  });

  const selected =
    detail.kind === "edit" ? suppliers.find((s) => s.id === detail.id) ?? null : null;

  return (
    <>
      <WorkflowHeader
        eyebrow="Master data"
        title="Suppliers"
        description="Supplier master. Mapping quality directly affects price auto-update behavior."
        actions={
          canWrite ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setDetail({ kind: "create" })}
            >
              + New supplier
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
            title={`${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"}`}
          >
            <div className="mb-3">
              <SearchFilterBar
                query={query}
                onQueryChange={setQuery}
                placeholder="Search by name, code, contact…"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>Terms</th>
                    <th className="text-right">Lead</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr
                      key={s.id}
                      className="cursor-pointer"
                      onClick={() => setDetail({ kind: "edit", id: s.id })}
                    >
                      <td className="font-mono text-xs">{s.code}</td>
                      <td>
                        <div className="font-medium">{s.name}</div>
                        {s.name_local ? (
                          <div className="text-2xs text-fg-muted" dir="auto">
                            {s.name_local}
                          </div>
                        ) : null}
                      </td>
                      <td className="text-xs">
                        {s.contact_person ?? "—"}
                        {s.contact_email ? (
                          <div className="text-2xs text-fg-muted">{s.contact_email}</div>
                        ) : null}
                      </td>
                      <td className="text-xs">{s.payment_terms ?? "—"}</td>
                      <td className="text-right font-mono tabular-nums">
                        {s.lead_time_days != null ? `${s.lead_time_days}d` : "—"}
                      </td>
                      <td>
                        {s.audit.active ? (
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
          </SectionCard>
        }
        detail={
          detail.kind === "closed" ? null : (
            <SupplierDetailPanel
              mode={detail}
              current={selected}
              onClose={() => setDetail({ kind: "closed" })}
              onSaved={() => qc.invalidateQueries({ queryKey: ["suppliers"] })}
            />
          )
        }
      />
    </>
  );
}

function SupplierDetailPanel({
  mode,
  current,
  onClose,
  onSaved,
}: {
  mode: DetailMode;
  current: SupplierDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const canWrite = useHasRole("admin");
  const isCreate = mode.kind === "create";
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: current
      ? { ...current }
      : { code: "", name: "", currency: "ILS" },
  });

  const createMut = useMutation({
    mutationFn: (v: FormValues) =>
      suppliersRepo.create(v as Omit<SupplierDto, "id" | "audit">),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const updateMut = useMutation({
    mutationFn: (v: FormValues) =>
      suppliersRepo.update(current!.id, v as Partial<SupplierDto>, current!.audit.version),
    onSuccess: () => onSaved(),
  });
  const archiveMut = useMutation({
    mutationFn: () => suppliersRepo.setActive(current!.id, !current!.audit.active),
    onSuccess: () => onSaved(),
  });

  const issues: ValidationIssue[] = Object.entries(errors).map(([f, e]) => ({
    field: f,
    message: (e as { message?: string })?.message ?? "invalid",
    level: "blocker",
  }));

  return (
    <SectionCard
      title={isCreate ? "New supplier" : current?.name ?? "Supplier"}
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
          <Field label="Contact person">
            <input className="input" dir="auto" {...register("contact_person")} />
          </Field>
          <Field label="Contact phone">
            <input className="input" {...register("contact_phone")} />
          </Field>
          <Field label="Contact email" error={errors.contact_email?.message} span={2}>
            <input className="input" {...register("contact_email")} />
          </Field>
          <Field label="Address" span={2}>
            <input className="input" dir="auto" {...register("address")} />
          </Field>
          <Field label="Currency" required>
            <input className="input uppercase" {...register("currency")} />
          </Field>
          <Field label="Payment terms">
            <input className="input" placeholder="e.g. net 30" {...register("payment_terms")} />
          </Field>
          <Field label="Lead time (days)">
            <input type="number" min="0" className="input" {...register("lead_time_days")} />
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
            canWrite
              ? "Price auto-update rules remain guarded by planning policy thresholds."
              : "Read-only for planner role."
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
                {isCreate ? "Create supplier" : "Save changes"}
              </button>
            ) : null
          }
        />
      </form>
    </SectionCard>
  );
}
