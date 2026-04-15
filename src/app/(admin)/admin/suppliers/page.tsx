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
import {
  ValidationSummary,
  type ValidationIssue,
} from "@/components/workflow/ValidationSummary";
import { AuditSnippet } from "@/components/data/AuditSnippet";
import { SearchFilterBar } from "@/components/data/SearchFilterBar";
import { Badge } from "@/components/badges/StatusBadge";
import { SplitListLayout } from "@/features/master-data/SplitListLayout";
import { useHasRole } from "@/lib/auth/role-gate";
import { suppliersRepo } from "@/lib/repositories";
import type { SupplierDto } from "@/lib/contracts/dto";
import { SUPPLIER_STATUSES } from "@/lib/contracts/enums";

// ---------------------------------------------------------------------------
// Suppliers admin — reconciled for Phase A.
//
// Matches the locked SupplierDto shape from 0002_masters.sql:
//
//   - text PK supplier_id (was synthetic `id`)
//   - supplier_name_official (was `name`)
//   - supplier_name_short (was `name_local`)
//   - status: 'ACTIVE' | 'INACTIVE' (no PENDING — locked decision;
//     suppliers only have these two states)
//   - supplier_type free-text
//   - primary_contact_name / primary_contact_phone
//   - currency, payment_terms, default_lead_time_days, default_moq
//   - approval_status
//   - Hebrew permitted in data fields per locked decision 6.
// ---------------------------------------------------------------------------

const schema = z.object({
  supplier_id: z.string().min(2, "Supplier ID is required."),
  supplier_name_official: z.string().min(2, "Official name is required."),
  supplier_name_short: z.string().optional(),
  status: z.enum(SUPPLIER_STATUSES),
  supplier_type: z.string().optional(),
  primary_contact_name: z.string().optional(),
  primary_contact_phone: z.string().optional(),
  currency: z.string().min(3).max(3),
  payment_terms: z.string().optional(),
  default_lead_time_days: z.coerce.number().int().nonnegative().optional(),
  default_moq: z.coerce.number().nonnegative().optional(),
  approval_status: z.string().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

type DetailMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; id: string };

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
    detail.kind === "edit"
      ? (suppliers.find((s) => s.supplier_id === detail.id) ?? null)
      : null;

  return (
    <>
      <WorkflowHeader
        eyebrow="Master data"
        title="Suppliers"
        description="Supplier master. Hebrew permitted in data fields; status is ACTIVE or INACTIVE only — no PENDING state for suppliers."
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
                placeholder="Search by name, ID, contact…"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Supplier ID</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Contact</th>
                    <th>Terms</th>
                    <th className="text-right">Lead</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr
                      key={s.supplier_id}
                      className="cursor-pointer"
                      onClick={() =>
                        setDetail({ kind: "edit", id: s.supplier_id })
                      }
                    >
                      <td className="font-mono text-xs">{s.supplier_id}</td>
                      <td>
                        <div className="font-medium" dir="auto">
                          {s.supplier_name_official}
                        </div>
                        {s.supplier_name_short ? (
                          <div
                            className="text-2xs text-fg-muted"
                            dir="auto"
                          >
                            {s.supplier_name_short}
                          </div>
                        ) : null}
                      </td>
                      <td className="text-xs">{s.supplier_type ?? "—"}</td>
                      <td className="text-xs" dir="auto">
                        {s.primary_contact_name ?? "—"}
                        {s.primary_contact_phone ? (
                          <div className="text-2xs text-fg-muted">
                            {s.primary_contact_phone}
                          </div>
                        ) : null}
                      </td>
                      <td className="text-xs">{s.payment_terms ?? "—"}</td>
                      <td className="text-right font-mono tabular-nums">
                        {s.default_lead_time_days != null
                          ? `${s.default_lead_time_days}d`
                          : "—"}
                      </td>
                      <td>
                        {s.status === "ACTIVE" ? (
                          <Badge tone="success">ACTIVE</Badge>
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
          detail.kind === "closed" ? null : (
            <SupplierDetailPanel
              mode={detail}
              current={selected}
              onClose={() => setDetail({ kind: "closed" })}
              onSaved={() =>
                qc.invalidateQueries({ queryKey: ["suppliers"] })
              }
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
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: current
      ? {
          supplier_id: current.supplier_id,
          supplier_name_official: current.supplier_name_official,
          supplier_name_short: current.supplier_name_short ?? undefined,
          status: current.status,
          supplier_type: current.supplier_type ?? undefined,
          primary_contact_name: current.primary_contact_name ?? undefined,
          primary_contact_phone: current.primary_contact_phone ?? undefined,
          currency: current.currency ?? "ILS",
          payment_terms: current.payment_terms ?? undefined,
          default_lead_time_days: current.default_lead_time_days ?? undefined,
          default_moq: current.default_moq ?? undefined,
          approval_status: current.approval_status ?? undefined,
          notes: current.notes ?? undefined,
        }
      : {
          supplier_id: "",
          supplier_name_official: "",
          status: "ACTIVE",
          currency: "ILS",
        },
  });

  const formValuesToDto = (v: FormValues): Partial<SupplierDto> => ({
    supplier_name_official: v.supplier_name_official,
    supplier_name_short: v.supplier_name_short ?? null,
    status: v.status,
    supplier_type: v.supplier_type ?? null,
    primary_contact_name: v.primary_contact_name ?? null,
    primary_contact_phone: v.primary_contact_phone ?? null,
    currency: v.currency,
    payment_terms: v.payment_terms ?? null,
    default_lead_time_days: v.default_lead_time_days ?? null,
    default_moq: v.default_moq ?? null,
    approval_status: v.approval_status ?? null,
    notes: v.notes ?? null,
  });

  const createMut = useMutation({
    mutationFn: (v: FormValues) =>
      suppliersRepo.create({
        supplier_id: v.supplier_id,
        ...formValuesToDto(v),
        site_id: "GT-MAIN",
      } as Omit<SupplierDto, "audit">),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const updateMut = useMutation({
    mutationFn: (v: FormValues) =>
      suppliersRepo.update(
        current!.supplier_id,
        formValuesToDto(v),
        current!.audit.version,
      ),
    onSuccess: () => onSaved(),
  });
  const archiveMut = useMutation({
    mutationFn: () =>
      suppliersRepo.setActive(current!.supplier_id, !current!.audit.active),
    onSuccess: () => onSaved(),
  });

  const issues: ValidationIssue[] = Object.entries(errors).map(([f, e]) => ({
    field: f,
    message: (e as { message?: string })?.message ?? "invalid",
    level: "blocker",
  }));

  return (
    <SectionCard
      title={
        isCreate
          ? "New supplier"
          : (current?.supplier_name_official ?? "Supplier")
      }
      description={isCreate ? undefined : current?.supplier_id}
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
            label="Supplier ID"
            required
            error={errors.supplier_id?.message}
          >
            <input
              className="input font-mono"
              {...register("supplier_id")}
              readOnly={!isCreate}
            />
          </Field>
          <Field label="Status" required>
            <select className="input" {...register("status")}>
              {SUPPLIER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Official name"
            required
            error={errors.supplier_name_official?.message}
            span={2}
          >
            <input
              className="input"
              dir="auto"
              {...register("supplier_name_official")}
            />
          </Field>
          <Field label="Short name" span={2}>
            <input
              className="input"
              dir="auto"
              {...register("supplier_name_short")}
            />
          </Field>
          <Field label="Supplier type">
            <input
              className="input"
              placeholder="e.g. ALCOHOL, PACKAGING"
              {...register("supplier_type")}
            />
          </Field>
          <Field label="Approval status">
            <input
              className="input"
              placeholder="e.g. APPROVED"
              {...register("approval_status")}
            />
          </Field>
          <Field label="Primary contact name">
            <input
              className="input"
              dir="auto"
              {...register("primary_contact_name")}
            />
          </Field>
          <Field label="Primary contact phone">
            <input className="input" {...register("primary_contact_phone")} />
          </Field>
          <Field label="Currency" required>
            <input className="input uppercase" {...register("currency")} />
          </Field>
          <Field label="Payment terms">
            <input
              className="input"
              placeholder="e.g. NET_30"
              {...register("payment_terms")}
            />
          </Field>
          <Field label="Default lead time (days)">
            <input
              type="number"
              min="0"
              className="input"
              {...register("default_lead_time_days")}
            />
          </Field>
          <Field label="Default MOQ">
            <input
              type="number"
              min="0"
              step="any"
              className="input"
              {...register("default_moq")}
            />
          </Field>
          <Field label="Notes" span={2}>
            <textarea className="textarea" {...register("notes")} />
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
                  if (
                    confirm(
                      `${current.audit.active ? "Archive" : "Reactivate"} ${current.supplier_name_official}?`,
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
                {isCreate ? "Create supplier" : "Save changes"}
              </button>
            ) : null
          }
        />
      </form>
    </SectionCard>
  );
}
