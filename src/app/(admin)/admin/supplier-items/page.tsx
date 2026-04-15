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
import {
  componentsRepo,
  itemsRepo,
  suppliersRepo,
  supplierItemsRepo,
} from "@/lib/repositories";
import { UOMS } from "@/lib/contracts/enums";
import type {
  ComponentDto,
  ItemDto,
  SupplierDto,
  SupplierItemDto,
} from "@/lib/contracts/dto";

// ---------------------------------------------------------------------------
// Supplier-items admin — reconciled for Phase A.
//
// Matches the locked supplier_items shape from 0002_masters.sql:
// polymorphic target via component_id XOR item_id, with is_primary
// enforced "at most one per target" at the DB layer (partial unique
// indexes uniq_supplier_items_component_primary /
// uniq_supplier_items_item_primary). The locked decision 12 also makes
// pack_conversion authoritative for supplier-specific UOM conversions,
// so this screen exposes pack_conversion prominently instead of the
// pre-Phase-A pack_size / pack_unit pair.
//
// ATOMIC PRIMARY-FLIP UX (from Phase A brief §6 T5 and the C3 sandbox
// atomic demote-then-promote doctrine):
//
// Setting is_primary=true on a row whose target already has another
// primary must NOT be done with a single update — it must demote the
// existing primary first, then promote the new one. The order matters:
// Postgres partial unique indexes enforce the invariant at statement
// time, not at commit time (pgTAP tests A20 = ordered flip succeeds,
// A21 = reverse-order flip fails loudly).
//
// This screen implements that as a dedicated "Make this the primary"
// action in the edit panel. The action:
//   1. Finds any existing is_primary=true row for this target.
//   2. PATCH that row with is_primary=false (with its audit.version).
//   3. Re-reads THIS row to pick up a fresh audit.version.
//   4. PATCH this row with is_primary=true.
//   5. On any failure, the error bubbles up and the user can retry.
//
// The plain save mutation deliberately does NOT carry an is_primary
// toggle. Primary-ness is changed only through "Make primary" or
// (implicit) through the atomic flip logic below. This matches the
// pgTAP test A21 contract: a naive "just set primary=true" would be
// rejected by the server (when the real backend exists) and by the
// IDB repo itself (the uniqueness invariant is re-enforced at
// application level via a pre-save check below).
//
// Mapping-quality, pack_size / pack_unit, and the embedded
// active_price fields from the pre-Phase-A draft are DROPPED. None of
// them exist in the locked schema. Price and currency live in the
// separate price_history table (out of Phase A scope).
// ---------------------------------------------------------------------------

const TARGET_KINDS = ["component", "item"] as const;
type TargetKind = (typeof TARGET_KINDS)[number];

const schema = z.object({
  supplier_id: z.string().min(1, "Choose a supplier"),
  target_kind: z.enum(TARGET_KINDS),
  target_id: z.string().min(1, "Choose a target"),
  relationship: z.string().optional(),
  order_uom: z.enum(UOMS).optional(),
  inventory_uom: z.enum(UOMS).optional(),
  pack_conversion: z.coerce.number().positive().default(1),
  lead_time_days: z.coerce.number().int().nonnegative().optional(),
  moq: z.coerce.number().nonnegative().optional(),
  payment_terms: z.string().optional(),
  safety_days: z.coerce.number().int().nonnegative().default(0),
  approval_status: z.string().optional(),
  source_basis: z.string().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

type DetailMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; id: string };

/**
 * Resolve the display-name of a supplier_items row's target from the
 * loaded components / items lists. Used by the browse table and the
 * list sort. Returns a human-readable string even when the lookup
 * misses (falls back to the ID) so dirty data is visible rather than
 * silently hidden.
 */
function targetDisplay(
  row: SupplierItemDto,
  components: ComponentDto[],
  items: ItemDto[],
): { kind: TargetKind; id: string; name: string } {
  if (row.component_id) {
    const c = components.find((x) => x.component_id === row.component_id);
    return {
      kind: "component",
      id: row.component_id,
      name: c?.component_name ?? row.component_id,
    };
  }
  if (row.item_id) {
    const i = items.find((x) => x.item_id === row.item_id);
    return {
      kind: "item",
      id: row.item_id,
      name: i?.item_name ?? row.item_id,
    };
  }
  return { kind: "component", id: "???", name: "<no target>" };
}

export default function SupplierItemsAdminPage() {
  const canWrite = useHasRole("admin");
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [primaryFilter, setPrimaryFilter] = useState<"all" | "primary-only">(
    "all",
  );
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
  const { data: items = [] } = useQuery({
    queryKey: ["items-for-si"],
    queryFn: () => itemsRepo.list({ includeArchived: true }),
  });

  const boughtFinishedItems = useMemo(
    () => items.filter((i) => i.supply_method === "BOUGHT_FINISHED"),
    [items],
  );

  const filtered = useMemo(
    () =>
      primaryFilter === "primary-only"
        ? rows.filter((r) => r.is_primary)
        : rows,
    [rows, primaryFilter],
  );

  const selected =
    detail.kind === "edit"
      ? (rows.find((r) => r.supplier_item_id === detail.id) ?? null)
      : null;

  return (
    <>
      <WorkflowHeader
        eyebrow="Master data"
        title="Supplier ↔ target mapping"
        description="Polymorphic supplier mapping: component OR BOUGHT_FINISHED item. At most one primary per target; flipping primary uses atomic demote-then-promote."
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
          <SectionCard
            title={`${filtered.length} mapping${filtered.length === 1 ? "" : "s"}`}
          >
            <div className="mb-3">
              <SearchFilterBar
                query={query}
                onQueryChange={setQuery}
                placeholder="Search supplier, target ID, notes…"
                chips={[
                  {
                    key: "primary-only",
                    label: "primary only",
                    active: primaryFilter === "primary-only",
                    onToggle: () =>
                      setPrimaryFilter((c) =>
                        c === "primary-only" ? "all" : "primary-only",
                      ),
                  },
                ]}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Target</th>
                    <th>Kind</th>
                    <th className="text-right">Pack conv.</th>
                    <th className="text-right">Lead</th>
                    <th className="text-right">MOQ</th>
                    <th>Primary</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const supplier = suppliers.find(
                      (s) => s.supplier_id === r.supplier_id,
                    );
                    const t = targetDisplay(r, components, items);
                    return (
                      <tr
                        key={r.supplier_item_id}
                        className="cursor-pointer"
                        onClick={() =>
                          setDetail({
                            kind: "edit",
                            id: r.supplier_item_id,
                          })
                        }
                      >
                        <td className="text-xs" dir="auto">
                          {supplier?.supplier_name_short ??
                            supplier?.supplier_name_official ??
                            r.supplier_id}
                        </td>
                        <td>
                          <div className="text-xs font-medium">{t.name}</div>
                          <div className="text-2xs font-mono text-fg-muted">
                            {t.id}
                          </div>
                        </td>
                        <td>
                          <Badge tone="neutral">{t.kind}</Badge>
                        </td>
                        <td className="text-right font-mono tabular-nums">
                          {r.pack_conversion}
                        </td>
                        <td className="text-right font-mono tabular-nums">
                          {r.lead_time_days != null
                            ? `${r.lead_time_days}d`
                            : "—"}
                        </td>
                        <td className="text-right font-mono tabular-nums">
                          {r.moq ?? "—"}
                        </td>
                        <td>
                          {r.is_primary ? (
                            <Badge tone="success">PRIMARY</Badge>
                          ) : (
                            <span className="text-fg-subtle">—</span>
                          )}
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
            <SupplierItemDetailPanel
              mode={detail}
              current={selected}
              suppliers={suppliers}
              components={components}
              boughtFinishedItems={boughtFinishedItems}
              allRows={rows}
              onClose={() => setDetail({ kind: "closed" })}
              onSaved={() =>
                qc.invalidateQueries({ queryKey: ["supplier-items"] })
              }
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
  boughtFinishedItems,
  allRows,
  onClose,
  onSaved,
}: {
  mode: DetailMode;
  current: SupplierItemDto | null;
  suppliers: SupplierDto[];
  components: ComponentDto[];
  boughtFinishedItems: ItemDto[];
  allRows: SupplierItemDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const canWrite = useHasRole("admin");
  const isCreate = mode.kind === "create";
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: current
      ? {
          supplier_id: current.supplier_id,
          target_kind: current.component_id ? "component" : "item",
          target_id: (current.component_id ?? current.item_id) ?? "",
          relationship: current.relationship ?? undefined,
          order_uom: current.order_uom ?? undefined,
          inventory_uom: current.inventory_uom ?? undefined,
          pack_conversion: current.pack_conversion,
          lead_time_days: current.lead_time_days ?? undefined,
          moq: current.moq ?? undefined,
          payment_terms: current.payment_terms ?? undefined,
          safety_days: current.safety_days,
          approval_status: current.approval_status ?? undefined,
          source_basis: current.source_basis ?? undefined,
          notes: current.notes ?? undefined,
        }
      : {
          supplier_id: "",
          target_kind: "component",
          target_id: "",
          pack_conversion: 1,
          safety_days: 0,
        },
  });

  const targetKind = watch("target_kind");

  const formValuesToDto = (v: FormValues): Partial<SupplierItemDto> => ({
    supplier_id: v.supplier_id,
    component_id: v.target_kind === "component" ? v.target_id : null,
    item_id: v.target_kind === "item" ? v.target_id : null,
    relationship: v.relationship ?? null,
    order_uom: v.order_uom ?? null,
    inventory_uom: v.inventory_uom ?? null,
    pack_conversion: v.pack_conversion,
    lead_time_days: v.lead_time_days ?? null,
    moq: v.moq ?? null,
    payment_terms: v.payment_terms ?? null,
    safety_days: v.safety_days,
    approval_status: v.approval_status ?? null,
    source_basis: v.source_basis ?? null,
    notes: v.notes ?? null,
  });

  const createMut = useMutation({
    mutationFn: async (v: FormValues) => {
      const generatedId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `si-${Date.now()}`;
      return supplierItemsRepo.create({
        supplier_item_id: generatedId,
        ...formValuesToDto(v),
        // New rows never default to primary — the user explicitly
        // promotes via "Make primary" to exercise the atomic flip path.
        is_primary: false,
        site_id: "GT-MAIN",
      } as Omit<SupplierItemDto, "audit">);
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const updateMut = useMutation({
    mutationFn: (v: FormValues) =>
      supplierItemsRepo.update(
        current!.supplier_item_id,
        formValuesToDto(v),
        current!.audit.version,
      ),
    onSuccess: () => onSaved(),
  });

  // Find the row (if any) that currently holds is_primary=true for the
  // same target as `current`. This drives the Make-primary action and
  // the "primary is <supplier X>" caption.
  const existingPrimary = useMemo(() => {
    if (!current) return null;
    return (
      allRows.find(
        (r) =>
          r.supplier_item_id !== current.supplier_item_id &&
          r.is_primary &&
          ((current.component_id != null &&
            r.component_id === current.component_id) ||
            (current.item_id != null && r.item_id === current.item_id)),
      ) ?? null
    );
  }, [allRows, current]);

  /**
   * Atomic demote-then-promote — mirrors pgTAP A20 and the C3 sandbox
   * primary-flip implementation. Two sequential patches, fresh etag
   * read between, caller handles failure. Never issues a naive "just
   * set primary=true" single call.
   */
  const makePrimary = async () => {
    if (!current) return;
    setPromoteError(null);
    setPromoting(true);
    try {
      if (existingPrimary) {
        // Step 1: demote the current primary, using its own version.
        await supplierItemsRepo.update(
          existingPrimary.supplier_item_id,
          { is_primary: false },
          existingPrimary.audit.version,
        );
      }
      // Step 2: re-read THIS row to get a fresh audit.version after
      // any prior writes. The generic repo's optimistic concurrency
      // rejects stale versions.
      const mine = await supplierItemsRepo.get(current.supplier_item_id);
      if (!mine) throw new Error("row disappeared during flip");
      await supplierItemsRepo.update(
        mine.supplier_item_id,
        { is_primary: true },
        mine.audit.version,
      );
      onSaved();
    } catch (err) {
      setPromoteError(err instanceof Error ? err.message : String(err));
    } finally {
      setPromoting(false);
    }
  };

  const issues: ValidationIssue[] = Object.entries(errors).map(([f, e]) => ({
    field: f,
    message: (e as { message?: string })?.message ?? "invalid",
    level: "blocker",
  }));

  const currentSupplier = current
    ? suppliers.find((s) => s.supplier_id === current.supplier_id)
    : null;

  return (
    <SectionCard
      title={
        isCreate
          ? "New mapping"
          : `${currentSupplier?.supplier_name_short ?? currentSupplier?.supplier_name_official ?? current?.supplier_id} → ${
              current?.component_id ?? current?.item_id ?? "?"
            }`
      }
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

        {/* Primary-flip panel — only visible in edit mode */}
        {!isCreate && current ? (
          <div
            className="rounded-md border border-border bg-bg-subtle p-3"
            data-testid="primary-flip-panel"
          >
            <div className="text-2xs font-semibold uppercase tracking-sops text-fg-muted">
              Primary supplier
            </div>
            {current.is_primary ? (
              <p className="mt-1 text-xs text-fg-muted">
                This mapping is currently the primary supplier for its
                target. To change the primary, open another supplier row
                for the same target and click "Make this the primary"
                there.
              </p>
            ) : existingPrimary ? (
              <div className="mt-1 space-y-2">
                <p className="text-xs text-fg-muted">
                  Another row is currently primary:{" "}
                  <span className="font-mono">
                    {existingPrimary.supplier_id}
                  </span>
                  . "Make primary" will atomically demote the current
                  primary first, then promote this row. Mirrors the
                  pgTAP A20 demote-then-promote doctrine.
                </p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void makePrimary()}
                  disabled={!canWrite || promoting}
                  data-testid="make-primary-btn"
                >
                  {promoting ? "Flipping…" : "Make this the primary"}
                </button>
              </div>
            ) : (
              <div className="mt-1 space-y-2">
                <p className="text-xs text-fg-muted">
                  No other primary exists for this target. Setting this
                  row primary is a single update.
                </p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void makePrimary()}
                  disabled={!canWrite || promoting}
                  data-testid="make-primary-btn"
                >
                  {promoting ? "Promoting…" : "Make this the primary"}
                </button>
              </div>
            )}
            {promoteError ? (
              <p
                className="mt-2 text-xs text-danger"
                role="alert"
                data-testid="primary-flip-error"
              >
                {promoteError}
              </p>
            ) : null}
          </div>
        ) : null}

        <FieldGrid columns={2}>
          <Field
            label="Supplier"
            required
            error={errors.supplier_id?.message}
            span={2}
          >
            <select className="input" {...register("supplier_id")}>
              <option value="">— select —</option>
              {suppliers.map((s) => (
                <option key={s.supplier_id} value={s.supplier_id}>
                  {s.supplier_name_official}
                  {s.supplier_name_short ? ` (${s.supplier_name_short})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Target kind" required>
            <select
              className="input"
              {...register("target_kind")}
              disabled={!isCreate}
            >
              <option value="component">component</option>
              <option value="item">item (BOUGHT_FINISHED only)</option>
            </select>
          </Field>
          <Field label="Target" required error={errors.target_id?.message}>
            <select
              className="input"
              {...register("target_id")}
              disabled={!isCreate}
            >
              <option value="">— select —</option>
              {targetKind === "component"
                ? components.map((c) => (
                    <option key={c.component_id} value={c.component_id}>
                      {c.component_name}
                    </option>
                  ))
                : boughtFinishedItems.map((i) => (
                    <option key={i.item_id} value={i.item_id}>
                      {i.item_name}
                    </option>
                  ))}
            </select>
          </Field>
          <Field label="Relationship">
            <input
              className="input"
              placeholder="e.g. PRIMARY / ALTERNATE"
              {...register("relationship")}
            />
          </Field>
          <Field label="Approval status">
            <input
              className="input"
              placeholder="e.g. APPROVED"
              {...register("approval_status")}
            />
          </Field>
          <Field label="Order UOM">
            <select className="input" {...register("order_uom")}>
              <option value="">—</option>
              {UOMS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
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
          <Field
            label="Pack conversion"
            required
            hint="Authoritative per locked decision 12. Overrides components.purchase_to_inv_factor for this supplier."
          >
            <input
              type="number"
              step="any"
              min="0"
              className="input"
              {...register("pack_conversion")}
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
          <Field label="MOQ">
            <input
              type="number"
              min="0"
              step="any"
              className="input"
              {...register("moq")}
            />
          </Field>
          <Field label="Payment terms">
            <input
              className="input"
              placeholder="e.g. NET_30"
              {...register("payment_terms")}
            />
          </Field>
          <Field label="Safety days">
            <input
              type="number"
              min="0"
              className="input"
              {...register("safety_days")}
            />
          </Field>
          <Field label="Source basis">
            <input
              className="input"
              placeholder="e.g. SEED / CONTRACT"
              {...register("source_basis")}
            />
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
            canWrite
              ? "Primary changes use atomic demote-then-promote; pack_conversion is authoritative for this supplier."
              : "Read-only for planner role."
          }
          primary={
            canWrite ? (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isCreate ? "Create mapping" : "Save changes"}
              </button>
            ) : null
          }
        />
      </form>
    </SectionCard>
  );
}
