"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Field, FieldGrid } from "@/components/workflow/FieldGrid";
import { FormActionsBar } from "@/components/workflow/FormActionsBar";
import { ValidationSummary, type ValidationIssue } from "@/components/workflow/ValidationSummary";
import { ApprovalBanner } from "@/components/workflow/ApprovalBanner";
import { DiffNotice } from "@/components/workflow/DiffNotice";
import { DateTimeInput } from "@/components/fields/DateTimeInput";
import { NotesBox } from "@/components/fields/NotesBox";
import { QuantityInput } from "@/components/fields/QuantityInput";
import { LineEditorTable } from "@/components/line-editor/LineEditorTable";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StaleNotice,
  SuccessState,
} from "@/components/feedback/states";
import { componentsRepo, itemsRepo, suppliersRepo } from "@/lib/repositories";
import { UOMS, type Uom } from "@/lib/contracts/enums";
import { useReviewMode } from "@/lib/review-mode/store";
import { StatePreviewChip } from "@/features/ops/StatePreviewChip";
import { goodsReceiptSchema } from "@/features/ops/goods-receipt-schema";

const schema = goodsReceiptSchema;
type FormValues = z.infer<typeof schema>;

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function GoodsReceiptPage() {
  const { forcedScreenState } = useReviewMode();
  const [view, setView] = useState<"form" | "success" | "approval" | "stale">("form");

  // `effective` drives the early-return branches below. It is the screen
  // state the page should render, OR `null` when the form itself should
  // render. Review-mode overrides always win. Otherwise, only non-"form"
  // view values map to a screen state; "form" falls through to the form.
  const effective: "loading" | "empty" | "validation_error" | "submission_pending" | "success" | "approval_required" | "stale_conflict" | null =
    forcedScreenState ?? (view === "form" ? null : viewToState(view));

  const { data: suppliers = [], isLoading: loadingSuppliers } = useQuery({
    queryKey: ["suppliers-for-receipts"],
    queryFn: () => suppliersRepo.list(),
  });
  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ["items-for-receipts"],
    queryFn: () => itemsRepo.list(),
  });
  const { data: components = [] } = useQuery({
    queryKey: ["components-for-receipts"],
    queryFn: () => componentsRepo.list(),
  });

  // Phase A reconciliation: components and items now use locked-schema
  // field names (component_id / component_name, item_id / item_name,
  // legacy_sku, etc.). A local adapter here flattens both entity types
  // into a uniform pick-list shape — this is a view-local display
  // normalization, not a compatibility alias at the DTO level.
  const receivable = useMemo(
    () =>
      [
        ...components.map((c) => ({
          id: c.component_id,
          label: c.component_name,
          sku: c.component_id,
          default_uom:
            (c.purchase_uom ?? c.inventory_uom ?? c.bom_uom ?? "UNIT") as Uom,
        })),
        ...items.map((i) => ({
          id: i.item_id,
          label: i.item_name,
          sku: i.legacy_sku ?? i.item_id,
          default_uom: (i.sales_uom ?? "UNIT") as Uom,
        })),
      ].sort((a, b) => a.label.localeCompare(b.label)),
    [components, items],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      event_at: nowLocal(),
      supplier_id: "",
      po_id: "",
      lines: [{ item_id: "", quantity: 0, unit: "UNIT" }],
      notes: "",
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const issues: ValidationIssue[] = Object.entries(form.formState.errors)
    .flatMap(([field, err]) => {
      if (field === "lines" && Array.isArray(err)) {
        return err.flatMap((lineErr, i) =>
          lineErr
            ? Object.entries(lineErr).map(([lf, le]) => ({
                field: `line ${i + 1} · ${lf}`,
                message: (le as { message?: string })?.message ?? "invalid",
                level: "blocker" as const,
              }))
            : []
        );
      }
      return [
        {
          field,
          message: (err as { message?: string })?.message ?? "invalid",
          level: "blocker" as const,
        },
      ];
    });

  if (effective === "loading" || loadingSuppliers || loadingItems) {
    return <LoadingState title="Loading masters…" description="Fetching suppliers and items." />;
  }
  if (effective === "empty") {
    return (
      <>
        <HeaderBlock />
        <EmptyState
          title="No goods to receive yet"
          description="Pick a supplier and start a receipt, or select an open PO from the planner inbox."
        />
      </>
    );
  }
  if (effective === "success") {
    return (
      <>
        <HeaderBlock />
        <SuccessState
          title="Receipt recorded (mock)"
          description="This is a shell. No event was posted. In production, this would project into the stock ledger."
          tone="success"
          action={
            <>
              <button className="btn btn-primary" onClick={() => setView("form")}>
                Record another receipt
              </button>
              <button className="btn">View submission</button>
            </>
          }
        >
          <div className="rounded-md border border-border bg-bg-subtle p-3 text-xs text-fg-muted">
            TODO-WINDOW1: server response envelope drives the exact summary shown here.
          </div>
        </SuccessState>
      </>
    );
  }
  if (effective === "approval_required") {
    return (
      <>
        <HeaderBlock />
        <SuccessState
          title="Held for review"
          description="This receipt was accepted but is pending approval. You do not need to do anything further."
          tone="warning"
          action={
            <button className="btn btn-primary" onClick={() => setView("form")}>
              Record another receipt
            </button>
          }
        >
          <div className="text-xs text-fg-muted">
            Trigger reason (mock): backdated more than policy window.
          </div>
        </SuccessState>
      </>
    );
  }
  if (effective === "stale_conflict") {
    return (
      <>
        <HeaderBlock />
        <StaleNotice
          title="PO state changed"
          description="The linked PO was closed by another user while you were entering this receipt. You can unlink it or reload."
          action={
            <button
              className="btn btn-ghost text-xs"
              onClick={() => setView("form")}
            >
              Back to form
            </button>
          }
        />
      </>
    );
  }
  if (effective === "submission_pending") {
    return (
      <>
        <HeaderBlock />
        <LoadingState
          title="Submitting…"
          description="This is a mock pending state. In production the form locks and the outbox queues on network failure."
        />
      </>
    );
  }
  if (effective === "validation_error") {
    // Intentional: show form with a synthesized error banner.
  }

  return (
    <>
      <HeaderBlock />
      <StatePreviewChip />

      {effective === "validation_error" ? (
        <ValidationSummary
          issues={[
            { field: "supplier", message: "Supplier is required", level: "blocker" },
            { field: "line 1 · quantity", message: "Quantity must be positive", level: "blocker" },
          ]}
        />
      ) : null}

      {issues.length > 0 ? <ValidationSummary issues={issues} /> : null}

      <form
        onSubmit={form.handleSubmit(() => {
          // TODO-WINDOW1: submit envelope → POST /mutations/goods-receipts
          setView("success");
        })}
        className="space-y-5"
      >
        <SectionCard title="Receipt context">
          <FieldGrid columns={2}>
            <Field label="Event time" required error={form.formState.errors.event_at?.message}>
              <DateTimeInput {...form.register("event_at")} />
            </Field>
            <Field label="Supplier" required error={form.formState.errors.supplier_id?.message}>
              <select
                className="input"
                data-testid="receipt-supplier-select"
                {...form.register("supplier_id")}
              >
                <option value="">— select —</option>
                {suppliers.map((s) => (
                  <option key={s.supplier_id} value={s.supplier_id}>
                    {s.supplier_name_official}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Open PO (optional)" hint="TODO-WINDOW1 · read-model GET /read/open-purchase-orders">
              <select className="input" {...form.register("po_id")}>
                <option value="">— no linked PO —</option>
                <option value="po_mock_001" disabled>
                  PO-2026-0121 (mock, no backend)
                </option>
              </select>
            </Field>
            <Field label="Header notes" span={1}>
              <NotesBox placeholder="Optional header-level notes." {...form.register("notes")} />
            </Field>
          </FieldGrid>
        </SectionCard>

        <SectionCard
          title="Lines"
          description="At least one line is required. Quantities must be positive."
        >
          <LineEditorTable
            rows={fields}
            onAddRow={() =>
              append({ item_id: "", quantity: 0, unit: "UNIT" as Uom })
            }
            onRemoveRow={(i) => remove(i)}
            keyFor={(row, i) => row.id ?? String(i)}
            addLabel="Add receipt line"
            columns={[
              {
                key: "item",
                header: "Item",
                width: "45%",
                render: (_row, i) => (
                  <select
                    className="input h-8"
                    data-testid={`receipt-line-item-${i}`}
                    {...form.register(`lines.${i}.item_id` as const)}
                    onChange={(e) => {
                      const opt = receivable.find((o) => o.id === e.target.value);
                      form.setValue(`lines.${i}.item_id`, e.target.value);
                      if (opt) {
                        form.setValue(`lines.${i}.unit`, opt.default_uom as Uom);
                        form.setValue(`lines.${i}.item_name`, opt.label);
                      }
                    }}
                  >
                    <option value="">— select —</option>
                    {receivable.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label} · {o.sku}
                      </option>
                    ))}
                  </select>
                ),
              },
              {
                key: "qty",
                header: "Quantity",
                align: "right",
                render: (_row, i) => (
                  <QuantityInput
                    unit={form.watch(`lines.${i}.unit`) as Uom}
                    className="h-8"
                    data-testid={`receipt-line-qty-${i}`}
                    {...form.register(`lines.${i}.quantity` as const)}
                  />
                ),
              },
              {
                key: "unit",
                header: "UoM",
                render: (_row, i) => (
                  <select
                    className="input h-8"
                    {...form.register(`lines.${i}.unit` as const)}
                  >
                    {UOMS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                ),
              },
              {
                key: "notes",
                header: "Notes",
                render: (_row, i) => (
                  <input
                    className="input h-8 text-xs"
                    placeholder="optional"
                    {...form.register(`lines.${i}.notes` as const)}
                  />
                ),
              },
            ]}
          />
        </SectionCard>

        <FormActionsBar
          hint="Submit builds a mutation envelope client-side. No network call in this shell build."
          secondary={
            <button type="button" className="btn" onClick={() => form.reset()}>
              Reset
            </button>
          }
          primary={
            <button type="submit" className="btn btn-primary">
              Submit receipt
            </button>
          }
        />
      </form>

      <DevNote label="TODO — Window 1 · Goods Receipt">
        <ul className="space-y-1 text-xs leading-relaxed text-fg-muted">
          <li className="flex gap-2">
            <span className="mt-[5px] dot bg-fg-faint" />
            <span>
              Final <code className="font-mono text-fg-strong">POST /mutations/goods-receipts</code> envelope and server dedup contract.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-[5px] dot bg-fg-faint" />
            <span>Attachment storage model (storage refs vs upload-first step).</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-[5px] dot bg-fg-faint" />
            <span>Over-receipt policy and extra-line confirm semantics.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-[5px] dot bg-fg-faint" />
            <span>Backdate warning threshold source (planning_policy key).</span>
          </li>
        </ul>
      </DevNote>
    </>
  );
}

function HeaderBlock() {
  return (
    <WorkflowHeader
      eyebrow="Operator form"
      title="Goods Receipt"
      description="Record physical goods arrival. Partial receipts are valid. Submission behavior is mocked in this shell build."
    />
  );
}

function viewToState(
  view: "form" | "success" | "approval" | "stale"
): "empty" | "success" | "approval_required" | "stale_conflict" {
  if (view === "success") return "success";
  if (view === "approval") return "approval_required";
  if (view === "stale") return "stale_conflict";
  return "empty";
}

function DevNote({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative mt-4 overflow-hidden rounded border border-dashed border-border/70 bg-bg-subtle/40 px-4 py-3">
      <div className="stripe-border absolute inset-y-0 left-0 w-[3px] opacity-40" aria-hidden />
      <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
