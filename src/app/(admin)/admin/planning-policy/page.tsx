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
import { SearchFilterBar } from "@/components/data/SearchFilterBar";
import { Badge } from "@/components/badges/StatusBadge";
import { SplitListLayout } from "@/features/master-data/SplitListLayout";
import { useHasRole } from "@/lib/auth/role-gate";
import { planningPolicyRepo } from "@/lib/repositories";
import type { PlanningPolicyDto } from "@/lib/contracts/dto";

// ---------------------------------------------------------------------------
// Planning policy admin — reconciled for Phase A.
//
// The locked planning_policy table is a flat text K/V store:
//
//   CREATE TABLE planning_policy (
//     key          text primary key,
//     value        text not null,
//     uom          text,
//     description  text,
//     updated_at   timestamptz not null default now()
//   );
//
// That means this page no longer has value_type / scope / scope_ref —
// the locked schema does not model those. If structured values or
// scoping become a v2 requirement, they come back as a separate
// concept, not by softening this DTO.
//
// Consequence: the admin page becomes substantially simpler. Four
// fields (key, value, uom, description). Key is immutable after
// create. No audit envelope, no optimistic concurrency version bump —
// the DTO does not carry one. Interpretation of `value` is per-key
// and is the caller's responsibility.
//
// Uses the new KeyValueRepository surface (list, get, put, remove)
// from the narrower repo base created in Wave 2a. Reason: the audited
// generic repo and its optimistic-concurrency contract is a poor fit
// for a flat K/V table, and Tom's Gate 1 decision was to build a
// narrower repo rather than soften either end.
// ---------------------------------------------------------------------------

const schema = z.object({
  key: z.string().min(2, "Key must be at least 2 characters."),
  value: z.string().min(1, "Value is required."),
  uom: z.string().optional().default(""),
  description: z.string().optional().default(""),
});
type FormValues = z.infer<typeof schema>;

type DetailMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; key: string };

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
    detail.kind === "edit"
      ? (policies.find((p) => p.key === detail.key) ?? null)
      : null;

  return (
    <>
      <WorkflowHeader
        eyebrow="Master data"
        title="Planning policy"
        description="Thresholds and behavior flags consumed by forms, planning engine, and integrations. Text-valued key/value store — interpretation is per key."
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
          <SectionCard
            title={`${policies.length} polic${policies.length === 1 ? "y" : "ies"}`}
          >
            <div className="mb-3">
              <SearchFilterBar
                query={query}
                onQueryChange={setQuery}
                placeholder="Search by key, description, or value…"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Description</th>
                    <th>UOM</th>
                    <th className="text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((p) => (
                    <tr
                      key={p.key}
                      className="cursor-pointer"
                      onClick={() =>
                        setDetail({ kind: "edit", key: p.key })
                      }
                    >
                      <td className="font-mono text-xs">{p.key}</td>
                      <td className="text-xs text-fg-muted">
                        {p.description ?? "—"}
                      </td>
                      <td className="text-xs">
                        {p.uom ? (
                          <Badge tone="neutral">{p.uom}</Badge>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="text-right font-mono tabular-nums">
                        {p.value}
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
              onSaved={() =>
                qc.invalidateQueries({ queryKey: ["planning-policy"] })
              }
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
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: current
      ? {
          key: current.key,
          value: current.value,
          uom: current.uom ?? "",
          description: current.description ?? "",
        }
      : {
          key: "",
          value: "",
          uom: "",
          description: "",
        },
  });

  const saveMut = useMutation({
    mutationFn: async (v: FormValues) => {
      const row: PlanningPolicyDto = {
        key: v.key,
        value: v.value,
        uom: v.uom && v.uom.length > 0 ? v.uom : null,
        description:
          v.description && v.description.length > 0 ? v.description : null,
        updated_at: new Date().toISOString(),
      };
      return planningPolicyRepo.put(row);
    },
    onSuccess: () => {
      onSaved();
      if (isCreate) onClose();
    },
  });

  const issues: ValidationIssue[] = Object.entries(errors).map(([f, e]) => ({
    field: f,
    message: (e as { message?: string })?.message ?? "invalid",
    level: "blocker",
  }));

  return (
    <SectionCard
      title={isCreate ? "New policy" : (current?.key ?? "Policy")}
      actions={
        <button type="button" className="btn btn-ghost text-xs" onClick={onClose}>
          Close
        </button>
      }
    >
      <form
        onSubmit={handleSubmit((v) => saveMut.mutate(v))}
        className="space-y-4"
      >
        {issues.length > 0 ? <ValidationSummary issues={issues} /> : null}
        <FieldGrid columns={2}>
          <Field
            label="Key"
            required
            error={errors.key?.message}
            span={2}
            hint={
              isCreate
                ? "Immutable after creation."
                : "Primary key — cannot be changed."
            }
          >
            <input
              className="input font-mono"
              {...register("key")}
              readOnly={!isCreate}
            />
          </Field>
          <Field
            label="Description"
            error={errors.description?.message}
            span={2}
          >
            <textarea className="textarea" {...register("description")} />
          </Field>
          <Field label="Value" required error={errors.value?.message}>
            <input className="input font-mono" {...register("value")} />
          </Field>
          <Field label="UOM / unit" hint="Optional clarifier, e.g. days, percent, qty.">
            <input className="input" {...register("uom")} />
          </Field>
        </FieldGrid>

        {!isCreate && current ? (
          <div className="rounded-md border border-border bg-bg-subtle p-3 text-xs text-fg-muted">
            Last updated{" "}
            <span className="font-mono tabular-nums">{current.updated_at}</span>
          </div>
        ) : null}

        <FormActionsBar
          hint={
            canWrite
              ? "Policy changes apply to future form submissions and planning runs; historic postings are unaffected."
              : "Read-only for planner role."
          }
          primary={
            canWrite ? (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isCreate ? "Create policy" : "Save changes"}
              </button>
            ) : null
          }
        />
      </form>
    </SectionCard>
  );
}
