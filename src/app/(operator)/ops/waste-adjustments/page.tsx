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
import {
  ADJUSTMENT_DIRECTIONS,
  ADJUSTMENT_REASONS,
  UOMS,
  type Uom,
} from "@/lib/contracts/enums";
import { useReviewMode } from "@/lib/review-mode/store";
import { StatePreviewChip } from "@/features/ops/StatePreviewChip";
import { wasteAdjustmentSchema } from "@/features/ops/waste-adjustment-schema";
import { cn } from "@/lib/cn";

const schema = wasteAdjustmentSchema;
type FormValues = z.infer<typeof schema>;

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// mock threshold — TODO-WINDOW1: read from planning_policy
const LARGE_THRESHOLD = 25;

export default function WasteAdjustmentPage() {
  const { forcedScreenState } = useReviewMode();
  const [view, setView] = useState<"form" | "success" | "approval">("form");

  const { data: components = [] } = useQuery({
    queryKey: ["components-for-waste"],
    queryFn: () => componentsRepo.list(),
  });
  const { data: items = [] } = useQuery({
    queryKey: ["items-for-waste"],
    queryFn: () => itemsRepo.list(),
  });

  const adjustable = useMemo(
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
      direction: "loss",
      item_id: "",
      quantity: 0,
      unit: "kg",
      notes: "",
    },
  });

  const direction = form.watch("direction");
  const quantity = form.watch("quantity");
  const willRequireApproval =
    direction === "positive" || Number(quantity) >= LARGE_THRESHOLD;

  const issues: ValidationIssue[] = Object.entries(form.formState.errors).map(
    ([f, e]) => ({
      field: f,
      message: (e as { message?: string })?.message ?? "invalid",
      level: "blocker",
    })
  );

  const effective = forcedScreenState ?? (view === "success" ? "success" : view === "approval" ? "approval_required" : "empty");

  if (effective === "loading") {
    return <LoadingState title="Loading item master…" />;
  }
  if (effective === "success") {
    return (
      <>
        <HeaderBlock />
        <SuccessState
          title="Adjustment recorded (mock)"
          description="Shell only — no ledger posting occurred."
          action={
            <button className="btn btn-primary" onClick={() => setView("form")}>
              Record another
            </button>
          }
        />
      </>
    );
  }
  if (effective === "approval_required") {
    return (
      <>
        <HeaderBlock />
        <SuccessState
          title="Held for planner approval"
          description="Positive corrections always require approval. Large losses above the threshold also route here."
          tone="warning"
          action={
            <button className="btn btn-primary" onClick={() => setView("form")}>
              Record another
            </button>
          }
        />
      </>
    );
  }
  if (effective === "submission_pending") {
    return <LoadingState title="Submitting…" />;
  }

  return (
    <>
      <HeaderBlock />
      <StatePreviewChip />

      {effective === "validation_error" ? (
        <ValidationSummary
          issues={[
            { field: "item_id", message: "Choose an item", level: "blocker" },
            { field: "quantity", message: "Quantity must be positive", level: "blocker" },
          ]}
        />
      ) : null}

      {issues.length > 0 ? <ValidationSummary issues={issues} /> : null}

      <form
        onSubmit={form.handleSubmit((v) => {
          if (v.direction === "positive") {
            const ok = window.confirm(
              `You are ADDING ${v.quantity} ${v.unit} of stock. Continue?`
            );
            if (!ok) return;
          }
          // TODO-WINDOW1: submit envelope → POST /mutations/waste-adjustments
          setView(willRequireApproval ? "approval" : "success");
        })}
        className="space-y-5"
      >
        <SectionCard
          eyebrow="Direction"
          title="Loss or positive correction"
          description="Positive corrections must feel exceptional. Selecting one escalates the form and always routes to planner approval."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ADJUSTMENT_DIRECTIONS.map((d) => {
              const isActive = direction === d;
              const isPositive = d === "positive";
              return (
                <label
                  key={d}
                  className={cn(
                    "group relative flex cursor-pointer flex-col gap-3 overflow-hidden rounded-md border p-4 transition-all duration-150 ease-out-quart",
                    isActive
                      ? isPositive
                        ? "border-warning bg-warning-softer shadow-raised"
                        : "border-accent/60 bg-accent-soft shadow-raised"
                      : "border-border/80 bg-bg-raised hover:border-border-strong hover:bg-bg-subtle/40"
                  )}
                >
                  {isActive ? (
                    <span
                      className={cn(
                        "absolute inset-y-0 left-0 w-[3px]",
                        isPositive ? "bg-warning" : "bg-accent"
                      )}
                    />
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors duration-150",
                          isActive
                            ? isPositive
                              ? "border-warning"
                              : "border-accent"
                            : "border-border-strong"
                        )}
                      >
                        {isActive ? (
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              isPositive ? "bg-warning" : "bg-accent"
                            )}
                          />
                        ) : null}
                      </span>
                      <input
                        type="radio"
                        value={d}
                        {...form.register("direction")}
                        className="sr-only"
                      />
                      <span
                        className={cn(
                          "text-sm font-semibold tracking-tightish",
                          isActive
                            ? isPositive
                              ? "text-warning-fg"
                              : "text-accent"
                            : "text-fg-strong"
                        )}
                      >
                        {d === "loss"
                          ? "Loss / write-down"
                          : "Positive correction"}
                      </span>
                    </div>
                    {isPositive ? (
                      <span className="rounded-sm border border-warning/40 bg-warning-soft px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-sops text-warning-fg">
                        Approval required
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs leading-relaxed text-fg-muted">
                    {d === "loss"
                      ? "Normal path. Breakage, spoilage, spillage. Auto-posts below the policy threshold."
                      : "Exceptional path. Always held for planner approval regardless of quantity — and always requires notes."}
                  </div>
                </label>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Adjustment">
          <FieldGrid columns={2}>
            <Field label="Event time" required>
              <DateTimeInput {...form.register("event_at")} />
            </Field>
            <Field label="Item" required error={form.formState.errors.item_id?.message}>
              <select
                className="input"
                {...form.register("item_id")}
                onChange={(e) => {
                  const o = adjustable.find((a) => a.id === e.target.value);
                  form.setValue("item_id", e.target.value);
                  if (o) form.setValue("unit", o.unit as Uom);
                }}
              >
                <option value="">— select —</option>
                {adjustable.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} · {o.sku}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantity" required error={form.formState.errors.quantity?.message}>
              <QuantityInput
                unit={form.watch("unit") as Uom}
                {...form.register("quantity")}
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
            <Field
              label="Reason"
              required
              error={form.formState.errors.reason_code?.message}
              span={2}
            >
              <select className="input" {...form.register("reason_code")}>
                <option value="">— select —</option>
                {ADJUSTMENT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r.replace("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Notes"
              hint={
                direction === "positive"
                  ? "Required for positive corrections."
                  : "Optional unless reason is 'other'."
              }
              error={form.formState.errors.notes?.message}
              span={2}
            >
              <NotesBox {...form.register("notes")} />
            </Field>
          </FieldGrid>
        </SectionCard>

        {willRequireApproval ? (
          <ApprovalBanner
            title="This adjustment will be held for planner approval"
            reason={
              direction === "positive"
                ? "Positive corrections always route to approval."
                : `Quantity ≥ threshold (${LARGE_THRESHOLD}).`
            }
            threshold={
              direction === "positive"
                ? "planning_policy.adjustment.positive.always_approval = true"
                : `planning_policy.adjustment.approval.large_threshold = ${LARGE_THRESHOLD}`
            }
          />
        ) : null}

        <FormActionsBar
          hint="Submit is mocked in this shell. Positive-direction submits prompt a confirm dialog."
          secondary={
            <button type="button" className="btn" onClick={() => form.reset()}>
              Reset
            </button>
          }
          primary={
            <button type="submit" className="btn btn-primary">
              Submit adjustment
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
      title="Waste / Adjustment"
      description="Report a stock loss or positive correction. Positive corrections must feel exceptional."
    />
  );
}
