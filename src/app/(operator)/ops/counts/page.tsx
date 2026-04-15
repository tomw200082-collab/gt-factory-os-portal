"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { ApprovalBanner } from "@/components/workflow/ApprovalBanner";
import { DateTimeInput } from "@/components/fields/DateTimeInput";
import { NotesBox } from "@/components/fields/NotesBox";
import { QuantityInput } from "@/components/fields/QuantityInput";
import { SuccessState, LoadingState } from "@/components/feedback/states";
import { componentsRepo, itemsRepo } from "@/lib/repositories";
import { UOMS, type Uom } from "@/lib/contracts/enums";
import { useReviewMode } from "@/lib/review-mode/store";
import { StatePreviewChip } from "@/features/ops/StatePreviewChip";
import { classifyCountVariance } from "@/features/ops/count-variance";

const schema = z.object({
  event_at: z.string().min(1),
  item_id: z.string().min(1, "Choose an item"),
  counted_quantity: z.coerce.number().nonnegative("Counted quantity must be zero or positive"),
  unit: z.enum(UOMS),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

type Outcome =
  | { kind: "none" }
  | { kind: "matched"; counted: number; unit: Uom }
  | { kind: "auto"; counted: number; system: number; unit: Uom }
  | { kind: "approval"; counted: number; system: number; unit: Uom };

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Mock system quantities keyed by item id. TODO-WINDOW1: this read model is
// forbidden pre-submit by the blind-count rule; server must NOT return it.
const MOCK_SYSTEM_QTY: Record<string, number> = {
  cmp_white_rum: 38,
  cmp_cane_sugar: 27,
  cmp_mint_leaves: 0.6,
  cmp_lime_juice: 9.4,
};

export default function PhysicalCountPage() {
  const { forcedScreenState } = useReviewMode();
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });

  const { data: components = [] } = useQuery({
    queryKey: ["components-for-counts"],
    queryFn: () => componentsRepo.list(),
  });
  const { data: items = [] } = useQuery({
    queryKey: ["items-for-counts"],
    queryFn: () => itemsRepo.list(),
  });
  const countable = useMemo(
    () =>
      [
        ...components.map((c) => ({
          id: c.id,
          label: c.name,
          sku: c.code,
          unit: c.default_uom,
        })),
        ...items.map((i) => ({
          id: i.id,
          label: i.name,
          sku: i.sku,
          unit: i.default_uom,
        })),
      ].sort((a, b) => a.label.localeCompare(b.label)),
    [components, items]
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      event_at: nowLocal(),
      item_id: "",
      counted_quantity: 0,
      unit: "kg",
      notes: "",
    },
  });

  const effective =
    forcedScreenState ??
    (outcome.kind === "none" ? "empty" : outcome.kind === "approval" ? "approval_required" : "success");

  const issues: ValidationIssue[] = Object.entries(form.formState.errors).map(
    ([f, e]) => ({
      field: f,
      message: (e as { message?: string })?.message ?? "invalid",
      level: "blocker",
    })
  );

  if (effective === "loading") return <LoadingState title="Loading item master…" />;
  if (effective === "submission_pending") return <LoadingState title="Posting count…" />;

  if (effective === "success" && outcome.kind !== "none") {
    if (outcome.kind === "matched") {
      return (
        <>
          <HeaderBlock />
          <SuccessState
            title="Count matches system"
            description={`Counted ${outcome.counted} ${outcome.unit}. No adjustment needed.`}
            tone="success"
            action={
              <button className="btn btn-primary" onClick={() => setOutcome({ kind: "none" })}>
                Count next item
              </button>
            }
          />
        </>
      );
    }
    const delta = outcome.counted - outcome.system;
    const pct = outcome.system ? (delta / outcome.system) * 100 : 0;
    return (
      <>
        <HeaderBlock />
        <SuccessState
          title={
            outcome.kind === "auto"
              ? "Count variance auto-posted"
              : "Count posted"
          }
          tone="warning"
          action={
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setOutcome({ kind: "none" })}
            >
              Count next item
            </button>
          }
        >
          <VarianceCard
            counted={outcome.counted}
            system={outcome.system}
            unit={outcome.unit}
            delta={delta}
            pct={pct}
          />
          <div className="mt-3 text-3xs text-fg-subtle">
            TODO-WINDOW1: whether variance posts as an anchor or as an
            adjustment row is a server-side decision.
          </div>
        </SuccessState>
      </>
    );
  }

  if (effective === "approval_required" && outcome.kind === "approval") {
    const delta = outcome.counted - outcome.system;
    const pct = outcome.system ? (delta / outcome.system) * 100 : 0;
    return (
      <>
        <HeaderBlock />
        <SuccessState
          title="Variance held for approval"
          description="This variance exceeds the auto-post threshold and routes to the planner approvals inbox."
          tone="warning"
          action={
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setOutcome({ kind: "none" })}
            >
              Count next item
            </button>
          }
        >
          <VarianceCard
            counted={outcome.counted}
            system={outcome.system}
            unit={outcome.unit}
            delta={delta}
            pct={pct}
          />
        </SuccessState>
      </>
    );
  }

  return (
    <>
      <HeaderBlock />
      <StatePreviewChip />

      {effective === "validation_error" ? (
        <ValidationSummary
          issues={[
            { field: "item_id", message: "Choose an item before entering a count", level: "blocker" },
          ]}
        />
      ) : null}

      {issues.length > 0 ? <ValidationSummary issues={issues} /> : null}

      <ApprovalBanner
        tone="info"
        title="Blind count"
        reason="System quantity is hidden until you submit. Enter the physical count exactly as observed."
      />

      <form
        onSubmit={form.handleSubmit((v) => {
          // TODO-WINDOW1: submit envelope → POST /mutations/physical-counts
          const system = MOCK_SYSTEM_QTY[v.item_id] ?? 20;
          const result = classifyCountVariance({
            counted_quantity: v.counted_quantity,
            system_quantity: system,
            auto_post_abs_floor: 2,
            auto_post_pct_ceiling: 5,
          });
          if (result.kind === "matched") {
            setOutcome({ kind: "matched", counted: v.counted_quantity, unit: v.unit });
          } else {
            setOutcome({
              kind: result.kind,
              counted: v.counted_quantity,
              system,
              unit: v.unit,
            });
          }
        })}
        className="space-y-5"
      >
        <SectionCard title="Count">
          <FieldGrid columns={2}>
            <Field label="Event time" required>
              <DateTimeInput {...form.register("event_at")} />
            </Field>
            <Field label="Item" required error={form.formState.errors.item_id?.message}>
              <select
                className="input"
                {...form.register("item_id")}
                onChange={(e) => {
                  const o = countable.find((a) => a.id === e.target.value);
                  form.setValue("item_id", e.target.value);
                  if (o) form.setValue("unit", o.unit as Uom);
                }}
              >
                <option value="">— select —</option>
                {countable.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} · {o.sku}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Counted quantity"
              required
              error={form.formState.errors.counted_quantity?.message}
              hint="Zero is a valid count."
            >
              <QuantityInput
                unit={form.watch("unit") as Uom}
                {...form.register("counted_quantity")}
              />
            </Field>
            <Field label="Unit">
              <select className="input" {...form.register("unit")}>
                {UOMS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes" span={2}>
              <NotesBox placeholder="Optional — e.g. 'half-full drum considered as 15 kg'." {...form.register("notes")} />
            </Field>
          </FieldGrid>
        </SectionCard>

        <FormActionsBar
          hint="System quantity will be revealed after you submit."
          secondary={
            <button type="button" className="btn" onClick={() => form.reset()}>
              Reset
            </button>
          }
          primary={
            <button type="submit" className="btn btn-primary">
              Submit count
            </button>
          }
        />
      </form>
    </>
  );
}

function HeaderBlock() {
  return (
    <WorkflowHeader
      eyebrow="Operator form"
      title="Physical Count"
      description="Blind full-count variant. System quantity is hidden until submission."
    />
  );
}

function VarianceCard({
  counted,
  system,
  unit,
  delta,
  pct,
}: {
  counted: number;
  system: number;
  unit: Uom;
  delta: number;
  pct: number;
}) {
  const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  return (
    <div className="grid grid-cols-3 gap-3 rounded border border-border/60 bg-bg-raised p-3">
      <div>
        <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          Counted
        </div>
        <div className="mt-1 font-mono text-lg font-semibold tabular-nums leading-none text-fg-strong">
          {counted}
        </div>
        <div className="mt-0.5 text-3xs uppercase text-fg-subtle">{unit}</div>
      </div>
      <div className="border-l border-border/60 pl-3">
        <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          System
        </div>
        <div className="mt-1 font-mono text-lg font-semibold tabular-nums leading-none text-fg-muted">
          {system}
        </div>
        <div className="mt-0.5 text-3xs uppercase text-fg-subtle">{unit}</div>
      </div>
      <div className="border-l border-border/60 pl-3">
        <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          Delta
        </div>
        <div
          className={`mt-1 font-mono text-lg font-semibold tabular-nums leading-none ${delta === 0 ? "text-success-fg" : delta > 0 ? "text-info-fg" : "text-danger-fg"}`}
        >
          {signed(delta.toFixed(2) as unknown as number)}
        </div>
        <div className="mt-0.5 font-mono text-3xs tabular-nums text-fg-subtle">
          {pct >= 0 ? "+" : ""}
          {pct.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}
