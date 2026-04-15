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
import { planningPolicyRepo } from "@/lib/repositories";
import type { PlanningPolicyDto } from "@/lib/contracts/dto";

const schema = z.object({
  key: z.string().min(2),
  description: z.string().min(5),
  value_type: z.enum(["number", "string", "boolean"]),
  value_raw: z.string().min(1),
  scope: z.enum(["global", "item", "supplier", "reason"]),
  scope_ref: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

type DetailMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; id: string };

function serializeValue(v: string, type: FormValues["value_type"]) {
  if (type === "number") return Number(v);
  if (type === "boolean") return v.toLowerCase() === "true";
  return v;
}

export default function PlanningPolicyAdminPage() {
  const canWrite = useHasRole("admin");
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<DetailMode>({ kind: "closed" });

  const { data: policies = [] } = useQuery({
    queryKey: ["planning-policy", query],
    queryFn: () => planningPolicyRepo.list({ query }),
  });

  const selected =
    detail.kind === "edit" ? policies.find((p) => p.id === detail.id) ?? null : null;

  return (
    <>
      <WorkflowHeader
        eyebrow="Master data"
        title="Planning policy"
        description="Thresholds and behavior flags consumed by forms, planning engine, and integrations. Changes take effect on next planning run."
        actions={
          canWrite ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setDetail({ kind: "create" })}
            >
              + New policy
            </button>
          ) : (
            <Badge tone="neutral">read-only for planner</Badge>
          )
        }
      />

      <SplitListLayout
        isDetailOpen={detail.kind !== "closed"}
        list={
          <SectionCard title={`${policies.length} polic${policies.length === 1 ? "y" : "ies"}`}>
            <div className="mb-3">
              <SearchFilterBar
                query={query}
                onQueryChange={setQuery}
                placeholder="Search by key or description…"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Description</th>
                    <th>Scope</th>
                    <th className="text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((p) => (
                    <tr
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => setDetail({ kind: "edit", id: p.id })}
                    >
                      <td className="font-mono text-xs">{p.key}</td>
                      <td className="text-xs text-fg-muted">{p.description}</td>
                      <td>
                        <Badge tone="neutral">{p.scope}</Badge>
                      </td>
                      <td className="text-right font-mono tabular-nums">
                        {String(p.value)}
                        <span className="ml-1 text-2xs text-fg-subtle">({p.value_type})</span>
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
            <PolicyDetailPanel
              mode={detail}
              current={selected}
              onClose={() => setDetail({ kind: "closed" })}
              onSaved={() => qc.invalidateQueries({ queryKey: ["planning-policy"] })}
            />
          )
        }
      />
    </>
  );
}

function PolicyDetailPanel({
  mode,
  current,
  onClose,
  onSaved,
}: {
  mode: DetailMode;
  current: PlanningPolicyDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const canWrite = useHasRole("admin");
  const isCreate = mode.kind === "create";
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: current
      ? {
          key: current.key,
          description: current.description,
          value_type: current.value_type,
          value_raw: String(current.value),
          scope: current.scope,
          scope_ref: current.scope_ref,
        }
      : {
          key: "",
          description: "",
          value_type: "number",
          value_raw: "",
          scope: "global",
        },
  });
  const valueType = watch("value_type");

  const createMut = useMutation({
    mutationFn: (v: FormValues) =>
      planningPolicyRepo.create({
        key: v.key,
        description: v.description,
        value: serializeValue(v.value_raw, v.value_type) as string | number | boolean,
        value_type: v.value_type,
        scope: v.scope,
        scope_ref: v.scope_ref,
      } as Omit<PlanningPolicyDto, "id" | "audit">),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const updateMut = useMutation({
    mutationFn: (v: FormValues) =>
      planningPolicyRepo.update(
        current!.id,
        {
          key: v.key,
          description: v.description,
          value: serializeValue(v.value_raw, v.value_type) as string | number | boolean,
          value_type: v.value_type,
          scope: v.scope,
          scope_ref: v.scope_ref,
        } as Partial<PlanningPolicyDto>,
        current!.audit.version
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
      title={isCreate ? "New policy" : current?.key ?? "Policy"}
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
          <Field label="Key" required error={errors.key?.message} span={2}>
            <input className="input font-mono" {...register("key")} />
          </Field>
          <Field label="Description" required error={errors.description?.message} span={2}>
            <textarea className="textarea" {...register("description")} />
          </Field>
          <Field label="Value type" required>
            <select className="input" {...register("value_type")}>
              <option value="number">number</option>
              <option value="string">string</option>
              <option value="boolean">boolean</option>
            </select>
          </Field>
          <Field label="Value" required error={errors.value_raw?.message}>
            {valueType === "boolean" ? (
              <select className="input" {...register("value_raw")}>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                className="input"
                type={valueType === "number" ? "number" : "text"}
                step="any"
                {...register("value_raw")}
              />
            )}
          </Field>
          <Field label="Scope" required>
            <select className="input" {...register("scope")}>
              <option value="global">global</option>
              <option value="item">item</option>
              <option value="supplier">supplier</option>
              <option value="reason">reason</option>
            </select>
          </Field>
          <Field label="Scope reference" hint="Item/supplier/reason id when scope is not global.">
            <input className="input font-mono" {...register("scope_ref")} />
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
              ? "Policy changes apply to future form submissions and planning runs; historic postings are unaffected."
              : "Read-only for planner role."
          }
          primary={
            canWrite ? (
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isCreate ? "Create policy" : "Save changes"}
              </button>
            ) : null
          }
        />
      </form>
    </SectionCard>
  );
}
