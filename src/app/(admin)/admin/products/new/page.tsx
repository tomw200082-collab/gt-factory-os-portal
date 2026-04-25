"use client";

// ---------------------------------------------------------------------------
// Admin · New Product Wizard — AMMC v1 Slice 7 (crystalline-drifting-dusk
// §G.7 + §C.2 "Wizard" spec).
//
// 7-step guided flow for end-to-end item setup. Composes the existing
// Quick-Create drawers + the new <Wizard> primitive.
//
// Steps:
//   1. Item basics (id, name, supply_method, family, sales_uom, case_pack)
//   2. Aliases (optional — LionWheel / Shopify / GI external SKUs)
//   3. BOM setup intent (MANUFACTURED / REPACK only; skipped for BOUGHT_FINISHED)
//   4. Components (draft lines; MANUFACTURED / REPACK only)
//   5. Suppliers + supplier-items (uses QuickCreateSupplierItem drawer-stack;
//      real-time creation)
//   6. Planning policy review (read-only; surfaces missing required keys)
//   7. Review + Publish — executes the full transactional-ish publish flow
//
// Publish flow (Step 7):
//   a. POST /api/items with Step 1 fields
//   b. POST /api/integration-sku-map/approve for each Step 2 alias
//   c. If MANUFACTURED/REPACK + user opted into BOM:
//        POST /api/boms/heads
//        POST /api/boms/versions (clone_from_version_id=null)
//        For each Step 4 line: POST /api/boms/versions/[v]/lines
//   d. Supplier-items from Step 5 are already created in real-time (no extra
//      call here — wizard tracks them in state only for summary display)
//   e. Final: GET /api/items/[id]/readiness and navigate to
//      /admin/products/[item_id]
//
// On partial publish failure: state is preserved; user can retry. Supplier-
// items created in Step 5 remain live regardless (acceptable trade-off; admin
// can clean up via /admin/supplier-items if needed — A13 per §7.2 dispatch).
//
// Role gate: admin-only. Non-admins see an access-denied banner (UI defense;
// backend gates all mutations to admin role).
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Wizard, type WizardStepProps } from "@/components/workflow/Wizard";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { Drawer } from "@/components/overlays/Drawer";
import {
  EntityPickerPlus,
  type EntityOption,
} from "@/components/fields/EntityPickerPlus";
import { QuickCreateComponent } from "@/components/admin/quick-create/QuickCreateComponent";
import { QuickCreateSupplierItem } from "@/components/admin/quick-create/QuickCreateSupplierItem";
import { AdminMutationError } from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";
import { fmtSupplyMethod } from "@/lib/display";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SupplyMethod = "MANUFACTURED" | "BOUGHT_FINISHED" | "REPACK";
type AliasChannel = "lionwheel" | "shopify" | "green_invoice";

interface AliasDraft {
  source_channel: AliasChannel;
  external_sku: string;
  notes?: string;
}

interface BomLineDraft {
  final_component_id: string;
  final_component_name: string;
  final_component_qty: string;
}

interface SupplierItemCreated {
  supplier_item_id: string;
  supplier_id: string;
  target_kind: "component" | "item";
  target_id: string;
}

interface NewProductWizardState {
  // Step 1
  item_id?: string;
  item_name?: string;
  supply_method?: SupplyMethod;
  family?: string;
  sales_uom?: string;
  case_pack?: string;
  // Step 2
  aliases: AliasDraft[];
  // Step 3
  create_bom: boolean;
  // Step 4
  bom_lines: BomLineDraft[];
  // Step 5
  supplier_items_created: SupplierItemCreated[];
  // Index signature to satisfy the Wizard<TState extends Record<string, unknown>>
  // constraint. All "real" fields are typed above; this is a structural
  // escape hatch so Wizard's generic accepts the shape.
  [key: string]: unknown;
}

interface ComponentRow {
  component_id: string;
  component_name: string;
  inventory_uom: string | null;
  status: string;
}

interface SupplierRow {
  supplier_id: string;
  supplier_name: string;
  status: string;
}

interface ItemRow {
  item_id: string;
  item_name: string;
  supply_method: string;
  status: string;
}

interface PlanningPolicyRow {
  key: string;
  value: string;
  uom: string | null;
}

type ListEnvelope<T> = { rows: T[]; count: number };

// Required planning policy keys per plan §B + §C.2 Step 6.
const REQUIRED_POLICY_KEYS = [
  "planning.horizon_weeks",
  "planning.grain",
  "planning.forecast.freeze_horizon_weeks",
  "planning.order.min_trigger_pct_of_moq",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AdminMutationError(
      res.status,
      (json as { message?: string })?.message ?? `HTTP ${res.status}`,
      (json as { code?: string })?.code,
      json,
    );
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// Step 1 — Item basics
// ---------------------------------------------------------------------------

function Step1ItemBasics({
  state,
  patch,
}: WizardStepProps<NewProductWizardState>): JSX.Element {
  return (
    <SectionCard
      title="Item basics"
      description="The core identity of the new product. You can edit any of these later from the item detail page."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            item_id <span className="text-danger">*</span>
          </span>
          <input
            className="input"
            placeholder="e.g. GT-LUI-LOW-1L"
            value={state.item_id ?? ""}
            onChange={(e) => patch({ item_id: e.target.value.trim() })}
          />
          <span className="mt-1 block text-3xs text-fg-subtle">
            Unique id — server will 409 on duplicate.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            item_name <span className="text-danger">*</span>
          </span>
          <input
            className="input"
            placeholder="Display name"
            value={state.item_name ?? ""}
            onChange={(e) => patch({ item_name: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            supply_method <span className="text-danger">*</span>
          </span>
          <select
            className="input"
            value={state.supply_method ?? ""}
            onChange={(e) =>
              patch({ supply_method: e.target.value as SupplyMethod })
            }
          >
            <option value="">(pick one)</option>
            <option value="MANUFACTURED">MANUFACTURED</option>
            <option value="BOUGHT_FINISHED">BOUGHT_FINISHED</option>
            <option value="REPACK">REPACK</option>
          </select>
          <span className="mt-1 block text-3xs text-fg-subtle">
            MANUFACTURED / REPACK walk all 7 steps. BOUGHT_FINISHED skips BOM
            + component setup.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            family
          </span>
          <input
            className="input"
            placeholder="e.g. COCKTAIL"
            value={state.family ?? ""}
            onChange={(e) => patch({ family: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            sales_uom <span className="text-danger">*</span>
          </span>
          <input
            className="input"
            placeholder="e.g. BOTTLE"
            value={state.sales_uom ?? ""}
            onChange={(e) => patch({ sales_uom: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            case_pack
          </span>
          <input
            className="input"
            type="number"
            min="1"
            placeholder="e.g. 12"
            value={state.case_pack ?? ""}
            onChange={(e) => patch({ case_pack: e.target.value })}
          />
        </label>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Aliases (optional)
// ---------------------------------------------------------------------------

function Step2Aliases({
  state,
  patch,
}: WizardStepProps<NewProductWizardState>): JSX.Element {
  const aliases = state.aliases ?? [];

  const addAlias = () => {
    patch({
      aliases: [
        ...aliases,
        { source_channel: "lionwheel", external_sku: "" },
      ],
    });
  };

  const updateAlias = (idx: number, delta: Partial<AliasDraft>) => {
    const next = aliases.slice();
    next[idx] = { ...next[idx], ...delta };
    patch({ aliases: next });
  };

  const removeAlias = (idx: number) => {
    patch({ aliases: aliases.filter((_, i) => i !== idx) });
  };

  return (
    <SectionCard
      title="Aliases"
      description="Optional. Map external SKUs (LionWheel, Shopify, Green Invoice) to this item. These will be posted as approved aliases on publish."
      actions={
        <button
          type="button"
          className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
          onClick={addAlias}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          Add alias
        </button>
      }
    >
      {aliases.length === 0 ? (
        <p className="text-sm text-fg-muted">
          No aliases yet. Skip this step if this item has no external SKU
          mappings, or add them now — you can always add more from
          /admin/sku-aliases later.
        </p>
      ) : (
        <div className="space-y-3">
          {aliases.map((a, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 gap-2 rounded-md border border-border/60 bg-bg-subtle/30 p-3 sm:grid-cols-[auto_1fr_1fr_auto]"
            >
              <select
                className="input"
                value={a.source_channel}
                onChange={(e) =>
                  updateAlias(idx, {
                    source_channel: e.target.value as AliasChannel,
                  })
                }
              >
                <option value="lionwheel">lionwheel</option>
                <option value="shopify">shopify</option>
                <option value="green_invoice">green_invoice</option>
              </select>
              <input
                className="input"
                placeholder="external_sku"
                value={a.external_sku}
                onChange={(e) =>
                  updateAlias(idx, { external_sku: e.target.value })
                }
              />
              <input
                className="input"
                placeholder="notes (optional)"
                value={a.notes ?? ""}
                onChange={(e) => updateAlias(idx, { notes: e.target.value })}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm inline-flex items-center gap-1 text-danger-fg"
                onClick={() => removeAlias(idx)}
                aria-label="Remove alias"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — BOM setup intent (MANUFACTURED / REPACK only)
// ---------------------------------------------------------------------------

function Step3BomSetup({
  state,
  patch,
}: WizardStepProps<NewProductWizardState>): JSX.Element {
  return (
    <SectionCard
      title="BOM setup"
      description="This item's supply method requires a bill of materials. The wizard will create the BOM head + a draft version on publish; you can add lines in the next step."
    >
      <div className="space-y-3 text-sm text-fg">
        <p>
          Your new item (<strong>{fmtSupplyMethod(state.supply_method ?? "")}</strong>) needs a BOM
          (bill of materials) to become planning-ready. On publish, we will:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-fg-muted">
          <li>Create a new <code>bom_head</code> row linked to this item</li>
          <li>Create a fresh <code>bom_version</code> row in status="draft"</li>
          <li>Add any lines you define in Step 4 to that draft version</li>
          <li>
            Leave the version as <strong>draft</strong> — you can publish it
            later from the BOM editor once all components are ready
          </li>
        </ul>

        <label className="flex items-center gap-2 rounded-md border border-border/60 bg-bg-subtle/40 p-3 text-sm">
          <input
            type="checkbox"
            checked={state.create_bom !== false}
            onChange={(e) => patch({ create_bom: e.target.checked })}
          />
          <span>
            Create BOM shell on publish (<strong>recommended</strong>). Uncheck
            to skip — item will land with <code>is_ready=false</code> until a
            BOM is set up later.
          </span>
        </label>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Components (MANUFACTURED / REPACK only)
// ---------------------------------------------------------------------------

function Step4Components({
  state,
  patch,
}: WizardStepProps<NewProductWizardState>): JSX.Element {
  const lines = state.bom_lines ?? [];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const componentsQuery = useQuery<ListEnvelope<ComponentRow>>({
    queryKey: ["admin", "components", "all-for-wizard"],
    queryFn: () => fetchJson("/api/components?limit=1000"),
  });

  const componentOptions: EntityOption[] = useMemo(() => {
    return (componentsQuery.data?.rows ?? [])
      .filter((c) => c.status === "ACTIVE")
      .map((c) => ({
        id: c.component_id,
        label: c.component_name,
        sublabel: c.component_id,
        hint: c.inventory_uom ?? undefined,
      }));
  }, [componentsQuery.data]);

  const componentsById = useMemo(() => {
    const map = new Map<string, ComponentRow>();
    for (const c of componentsQuery.data?.rows ?? []) {
      map.set(c.component_id, c);
    }
    return map;
  }, [componentsQuery.data]);

  const addLine = (componentId: string) => {
    if (!componentId) return;
    if (lines.some((l) => l.final_component_id === componentId)) {
      // Avoid duplicate component on multiple lines (mirrors
      // v_bom_version_readiness.duplicate_component integrity check).
      return;
    }
    const comp = componentsById.get(componentId);
    patch({
      bom_lines: [
        ...lines,
        {
          final_component_id: componentId,
          final_component_name: comp?.component_name ?? componentId,
          final_component_qty: "1",
        },
      ],
    });
    setPickerOpen(false);
  };

  const updateQty = (idx: number, qty: string) => {
    const next = lines.slice();
    next[idx] = { ...next[idx], final_component_qty: qty };
    patch({ bom_lines: next });
  };

  const removeLine = (idx: number) => {
    patch({ bom_lines: lines.filter((_, i) => i !== idx) });
  };

  return (
    <>
      <SectionCard
        title="Components"
        description="Add the components that make up this item's BOM. Quantities are per unit of output; you can tune them later in the BOM editor."
        actions={
          <button
            type="button"
            className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
            onClick={() => setPickerOpen(true)}
            disabled={componentsQuery.isLoading}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add component
          </button>
        }
      >
        {lines.length === 0 ? (
          <p className="text-sm text-fg-muted">
            No components yet. Use “Add component” to pick from existing
            components or create a new one inline.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Component
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Quantity per
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    UoM
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    &nbsp;
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const comp = componentsById.get(l.final_component_id);
                  return (
                    <tr
                      key={l.final_component_id}
                      className="border-b border-border/40 last:border-b-0"
                    >
                      <td className="px-3 py-2">
                        <div className="text-fg-strong">
                          {l.final_component_name}
                        </div>
                        <div className="font-mono text-3xs text-fg-subtle">
                          {l.final_component_id}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          className="input w-24 text-right"
                          value={l.final_component_qty}
                          onChange={(e) => updateQty(idx, e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-fg-muted">
                        {comp?.inventory_uom ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm inline-flex items-center gap-1 text-danger-fg"
                          onClick={() => removeLine(idx)}
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Drawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add component"
        description="Pick an existing component or create a new one inline."
        width="lg"
      >
        <div className="space-y-3">
          <EntityPickerPlus
            value=""
            onChange={(opt) => addLine(opt?.id ?? "")}
            options={componentOptions}
            placeholder="Search components…"
            entityName="component"
            onCreateNew={() => setQuickCreateOpen(true)}
          />
        </div>
      </Drawer>

      <QuickCreateComponent
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={(newId) => {
          // Auto-add the new component as a line.
          // NB: the picker drawer stays open; the new row will appear in the
          // picker's list once TanStack Query re-fetches (invalidated inside
          // QuickCreateComponent). To keep the flow tight we also auto-add
          // the line here with a best-effort name — it will refresh to the
          // real name once componentsQuery refetches.
          patch({
            bom_lines: [
              ...(state.bom_lines ?? []),
              {
                final_component_id: newId,
                final_component_name: newId,
                final_component_qty: "1",
              },
            ],
          });
          setPickerOpen(false);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Suppliers & supplier-items
// ---------------------------------------------------------------------------

function Step5Suppliers({
  state,
  patch,
}: WizardStepProps<NewProductWizardState>): JSX.Element {
  const isBoughtFinished = state.supply_method === "BOUGHT_FINISHED";
  const [qcOpen, setQcOpen] = useState(false);
  const [qcTarget, setQcTarget] = useState<
    | { kind: "component"; id: string }
    | { kind: "item"; id: string }
    | null
  >(null);

  // Fetch dependencies the QuickCreateSupplierItem drawer requires.
  const suppliersQuery = useQuery<ListEnvelope<SupplierRow>>({
    queryKey: ["admin", "suppliers", "all-for-wizard"],
    queryFn: () => fetchJson("/api/suppliers?limit=1000"),
  });
  const componentsQuery = useQuery<ListEnvelope<ComponentRow>>({
    queryKey: ["admin", "components", "all-for-wizard"],
    queryFn: () => fetchJson("/api/components?limit=1000"),
  });
  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "items", "all-for-wizard"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
  });

  const supplierOptions: EntityOption[] = useMemo(() => {
    return (suppliersQuery.data?.rows ?? [])
      .filter((s) => s.status === "ACTIVE")
      .map((s) => ({
        id: s.supplier_id,
        label: s.supplier_name,
        sublabel: s.supplier_id,
      }));
  }, [suppliersQuery.data]);

  const componentOptions: EntityOption[] = useMemo(() => {
    return (componentsQuery.data?.rows ?? [])
      .filter((c) => c.status === "ACTIVE")
      .map((c) => ({
        id: c.component_id,
        label: c.component_name,
        sublabel: c.component_id,
      }));
  }, [componentsQuery.data]);

  const itemOptions: EntityOption[] = useMemo(() => {
    return (itemsQuery.data?.rows ?? [])
      .filter((i) => i.supply_method === "BOUGHT_FINISHED")
      .map((i) => ({
        id: i.item_id,
        label: i.item_name,
        sublabel: i.item_id,
      }));
  }, [itemsQuery.data]);

  const componentsById = useMemo(() => {
    const map = new Map<string, ComponentRow>();
    for (const c of componentsQuery.data?.rows ?? []) {
      map.set(c.component_id, c);
    }
    return map;
  }, [componentsQuery.data]);

  const openQcFor = (kind: "component" | "item", id: string) => {
    setQcTarget({ kind, id } as typeof qcTarget extends infer T ? T : never);
    setQcOpen(true);
  };

  // Targets to cover:
  //   BOUGHT_FINISHED → the item itself (polymorphic supplier_items.item_id).
  //                     But the item doesn't exist yet — the wizard will
  //                     create it at publish-time. So supplier-item creation
  //                     here is advisory only; operator should add it from
  //                     /admin/supplier-items after publish. We surface this
  //                     clearly rather than silently failing.
  //   MANUFACTURED / REPACK → each component from Step 4's bom_lines.
  const componentTargets = (state.bom_lines ?? []).map((l) => ({
    kind: "component" as const,
    id: l.final_component_id,
    label: l.final_component_name,
  }));

  const existingSupplierItems = state.supplier_items_created ?? [];

  return (
    <>
      {isBoughtFinished ? (
        <SectionCard
          title="Supplier mapping"
          description="This is a BOUGHT_FINISHED item. Supplier-item mapping will be set up from /admin/supplier-items after publish — the item_id must exist in the database first."
          tone="info"
        >
          <p className="text-sm text-fg-muted">
            After publish, visit <code>/admin/supplier-items</code> → click
            “+ New supplier-item” → pick this item as the target and fill in
            price, lead time, MOQ, and pack conversion. The supplier detail
            page will also surface a “+ supplier-item” link.
          </p>
        </SectionCard>
      ) : componentTargets.length === 0 ? (
        <SectionCard
          title="Supplier-items"
          description="No components in Step 4 — nothing to map suppliers to. You can skip this step or go back and add components first."
          tone="warning"
        >
          <p className="text-sm text-fg-muted">
            Add components in Step 4, then return here to assign suppliers
            for each.
          </p>
        </SectionCard>
      ) : (
        <SectionCard
          title="Supplier-items"
          description="For each component, add at least one approved supplier-item with price, lead time, MOQ, and pack conversion. Supplier-items are created immediately — they persist even if you save the wizard as draft."
        >
          <div className="space-y-3">
            {componentTargets.map((t) => {
              const existing = existingSupplierItems.filter(
                (si) => si.target_kind === "component" && si.target_id === t.id,
              );
              return (
                <div
                  key={t.id}
                  className="rounded-md border border-border/60 bg-bg-subtle/30 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-fg-strong">
                        {t.label}
                      </div>
                      <div className="font-mono text-3xs text-fg-subtle">
                        {t.id}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
                      onClick={() => openQcFor("component", t.id)}
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                      Add supplier-item
                    </button>
                  </div>
                  {existing.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {existing.map((si) => (
                        <Badge
                          key={si.supplier_item_id}
                          tone="success"
                          dotted
                        >
                          {si.supplier_id}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-3xs text-fg-subtle">
                      No supplier-item yet.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {qcTarget ? (
        <QuickCreateSupplierItem
          open={qcOpen}
          onClose={() => setQcOpen(false)}
          onCreated={(newId) => {
            if (!qcTarget) return;
            patch({
              supplier_items_created: [
                ...(state.supplier_items_created ?? []),
                {
                  supplier_item_id: newId,
                  // supplier_id isn't directly returned here; wizard tracks
                  // the new id + target for display only. The authoritative
                  // supplier-item row lives in the DB from this point on.
                  supplier_id: "(see supplier-items admin)",
                  target_kind: qcTarget.kind,
                  target_id: qcTarget.id,
                },
              ],
            });
          }}
          suppliers={supplierOptions}
          components={componentOptions}
          items={itemOptions}
          defaultComponentId={
            qcTarget.kind === "component" ? qcTarget.id : undefined
          }
          defaultItemId={qcTarget.kind === "item" ? qcTarget.id : undefined}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — Planning policy review
// ---------------------------------------------------------------------------

function Step6PlanningPolicy({
  markBlocker,
  clearBlocker,
}: WizardStepProps<NewProductWizardState>): JSX.Element {
  const policyQuery = useQuery<ListEnvelope<PlanningPolicyRow>>({
    queryKey: ["admin", "planning-policy"],
    queryFn: () => fetchJson("/api/planning-policy?limit=1000"),
  });

  const presentKeys = useMemo(() => {
    const set = new Set<string>();
    for (const r of policyQuery.data?.rows ?? []) set.add(r.key);
    return set;
  }, [policyQuery.data]);

  const missing = REQUIRED_POLICY_KEYS.filter((k) => !presentKeys.has(k));

  // Record / clear a blocker so the Wizard header surfaces it.
  const blockerKey = "planning-policy";
  useMemo(() => {
    if (missing.length > 0) {
      markBlocker(
        blockerKey,
        `Missing required planning policy keys: ${missing.join(", ")}. Fix at /admin/planning-policy before publishing.`,
      );
    } else {
      clearBlocker(blockerKey);
    }
    // Run once per change of missing-set. ESLint deps-exhaustive is fine to
    // ignore here because markBlocker/clearBlocker are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing.join(",")]);

  if (policyQuery.isLoading) {
    return (
      <SectionCard title="Planning policy" description="Loading…">
        <div className="text-sm text-fg-muted">Loading policy values…</div>
      </SectionCard>
    );
  }
  if (policyQuery.isError) {
    return (
      <SectionCard title="Planning policy" description="Load failed" tone="danger">
        <div className="text-sm text-danger-fg">
          {(policyQuery.error as Error).message}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Planning policy"
      description="Read-only review of the required planning policy keys. Missing keys block publish — fix them in /admin/planning-policy."
      tone={missing.length > 0 ? "warning" : "default"}
      actions={
        <Link
          href="/admin/planning-policy"
          className="btn btn-ghost btn-sm"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open planning policy
        </Link>
      }
    >
      <ul className="space-y-2 text-sm">
        {REQUIRED_POLICY_KEYS.map((k) => {
          const row = (policyQuery.data?.rows ?? []).find((r) => r.key === k);
          const present = !!row;
          return (
            <li
              key={k}
              className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-bg-subtle/30 p-3"
            >
              <div>
                <div className="font-mono text-xs text-fg">{k}</div>
                <div className="text-3xs text-fg-subtle">
                  {present
                    ? `value: ${row!.value}${row!.uom ? ` (${row!.uom})` : ""}`
                    : "not set"}
                </div>
              </div>
              {present ? (
                <Badge tone="success" dotted>
                  set
                </Badge>
              ) : (
                <Badge tone="danger" dotted>
                  missing
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Step 7 — Review + Publish
// ---------------------------------------------------------------------------

function Step7Review({
  state,
}: WizardStepProps<NewProductWizardState>): JSX.Element {
  const lines = state.bom_lines ?? [];
  const aliases = state.aliases ?? [];
  const supplierItems = state.supplier_items_created ?? [];

  return (
    <div className="space-y-4">
      <SectionCard
        title="Review — item basics"
        eyebrow="Step 1"
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <Field label="Item ID" value={state.item_id ?? "(not set)"} />
          <Field label="Name" value={state.item_name ?? "(not set)"} />
          <Field label="Supply method" value={state.supply_method ?? "(not set)"} />
          <Field label="Family" value={state.family ?? "—"} />
          <Field label="Sales UOM" value={state.sales_uom ?? "(not set)"} />
          <Field label="Case pack" value={state.case_pack ?? "—"} />
        </dl>
      </SectionCard>

      <SectionCard
        title={`Review — aliases (${aliases.length})`}
        eyebrow="Step 2"
      >
        {aliases.length === 0 ? (
          <p className="text-sm text-fg-muted">No aliases.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {aliases.map((a, idx) => (
              <li
                key={idx}
                className="flex items-center gap-2 rounded border border-border/40 bg-bg-subtle/30 px-2 py-1"
              >
                <Badge tone="info" dotted>
                  {a.source_channel}
                </Badge>
                <span className="font-mono text-xs">{a.external_sku}</span>
                {a.notes ? (
                  <span className="text-3xs text-fg-subtle">· {a.notes}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Review — BOM" eyebrow="Step 3 + 4">
        {state.supply_method === "BOUGHT_FINISHED" ? (
          <p className="text-sm text-fg-muted">
            BOUGHT_FINISHED item — no BOM will be created.
          </p>
        ) : !state.create_bom ? (
          <p className="text-sm text-warning-fg">
            BOM creation skipped. Item will land with <code>is_ready=false</code>{" "}
            until a BOM is set up later.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-fg">
              Will create BOM head + draft version with{" "}
              <strong>{lines.length}</strong> line{lines.length === 1 ? "" : "s"}.
              The version lands in <strong>draft</strong> status; publish it from
              the BOM editor once all components are ready.
            </p>
            {lines.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {lines.map((l) => (
                  <li
                    key={l.final_component_id}
                    className="flex items-center justify-between gap-3 rounded border border-border/40 bg-bg-subtle/30 px-2 py-1"
                  >
                    <span className="font-mono text-xs">
                      {l.final_component_id}
                    </span>
                    <span className="text-xs text-fg-muted">
                      qty {l.final_component_qty}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={`Review — supplier-items created (${supplierItems.length})`}
        eyebrow="Step 5"
        description="These supplier-items are already live in the database. They persist regardless of whether you publish or save as draft."
      >
        {supplierItems.length === 0 ? (
          <p className="text-sm text-fg-muted">
            No supplier-items created in this wizard.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {supplierItems.map((si) => (
              <li
                key={si.supplier_item_id}
                className="flex items-center gap-2 rounded border border-border/40 bg-bg-subtle/30 px-2 py-1"
              >
                <Badge tone="success" dotted>
                  {si.target_kind}
                </Badge>
                <span className="font-mono text-xs">{si.target_id}</span>
                <span className="text-3xs text-fg-subtle">
                  → supplier_item_id {si.supplier_item_id}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Ready to publish?"
        description="Click Publish below to create the item + any BOM shell + approved aliases. You can Save as draft instead if you want to keep the in-progress state in your browser."
        tone="info"
      >
        <p className="text-sm text-fg-muted">
          After a successful publish, you will be redirected to the new
          product's detail page where you can review readiness and make further
          edits.
        </p>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Publish flow
// ---------------------------------------------------------------------------

async function executePublish(
  state: NewProductWizardState,
): Promise<{ item_id: string }> {
  if (!state.item_id) throw new Error("item_id is required");
  if (!state.item_name) throw new Error("item_name is required");
  if (!state.supply_method) throw new Error("supply_method is required");
  if (!state.sales_uom) throw new Error("sales_uom is required");

  // a) POST /api/items
  const itemBody: Record<string, unknown> = {
    item_id: state.item_id,
    item_name: state.item_name,
    supply_method: state.supply_method,
    sales_uom: state.sales_uom,
  };
  if (state.family) itemBody.family = state.family;
  if (state.case_pack) itemBody.case_pack = Number(state.case_pack);
  await postJson<{ item_id: string }>("/api/items", itemBody);

  // b) Aliases — batch approve
  const aliases = (state.aliases ?? []).filter((a) => a.external_sku.trim());
  if (aliases.length > 0) {
    await postJson<{ approved_aliases: unknown[] }>(
      "/api/integration-sku-map/approve",
      {
        idempotency_key: randomIdempotencyKey(),
        aliases: aliases.map((a) => ({
          source_channel: a.source_channel,
          external_sku: a.external_sku.trim(),
          item_id: state.item_id!,
          notes: a.notes?.trim() || undefined,
        })),
      },
    );
  }

  // c) BOM head + version + lines (MANUFACTURED / REPACK only, if opted in)
  const wantsBom =
    state.supply_method !== "BOUGHT_FINISHED" && state.create_bom !== false;
  if (wantsBom) {
    const headRes = await postJson<{ bom_head_id: string }>(
      "/api/boms/heads",
      {
        item_id: state.item_id,
        idempotency_key: randomIdempotencyKey(),
      },
    );
    const versionRes = await postJson<{ bom_version_id: string }>(
      "/api/boms/versions",
      {
        head_id: headRes.bom_head_id,
        clone_from_version_id: null,
        idempotency_key: randomIdempotencyKey(),
      },
    );
    const lines = state.bom_lines ?? [];
    for (const line of lines) {
      await postJson<{ line_id: string }>(
        `/api/boms/versions/${encodeURIComponent(versionRes.bom_version_id)}/lines`,
        {
          final_component_id: line.final_component_id,
          final_component_qty: line.final_component_qty,
          idempotency_key: randomIdempotencyKey(),
        },
      );
    }
  }

  return { item_id: state.item_id };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminNewProductWizardPage(): JSX.Element {
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const router = useRouter();
  const queryClient = useQueryClient();

  const [dynamicSteps, setDynamicSteps] = useState<
    Array<"one" | "two" | "three" | "four" | "five" | "six" | "seven">
  >(["one", "two", "three", "four", "five", "six", "seven"]);

  const steps = useMemo(
    () => [
      {
        id: "one",
        title: "Item basics",
        Component: Step1ItemBasics,
        validate: async (s: NewProductWizardState) => {
          const issues: Array<{
            level: "blocker";
            field?: string;
            message: string;
          }> = [];
          if (!s.item_id?.trim())
            issues.push({
              level: "blocker",
              field: "item_id",
              message: "item_id is required.",
            });
          if (!s.item_name?.trim())
            issues.push({
              level: "blocker",
              field: "item_name",
              message: "item_name is required.",
            });
          if (!s.supply_method)
            issues.push({
              level: "blocker",
              field: "supply_method",
              message: "supply_method is required.",
            });
          if (!s.sales_uom?.trim())
            issues.push({
              level: "blocker",
              field: "sales_uom",
              message: "sales_uom is required.",
            });
          // Compute step-flow path for this supply_method.
          if (s.supply_method === "BOUGHT_FINISHED") {
            setDynamicSteps(["one", "two", "five", "six", "seven"]);
          } else {
            setDynamicSteps([
              "one",
              "two",
              "three",
              "four",
              "five",
              "six",
              "seven",
            ]);
          }
          return { ok: issues.length === 0, issues };
        },
      },
      { id: "two", title: "Aliases", Component: Step2Aliases },
      { id: "three", title: "BOM setup", Component: Step3BomSetup },
      { id: "four", title: "Components", Component: Step4Components },
      { id: "five", title: "Suppliers", Component: Step5Suppliers },
      { id: "six", title: "Planning policy", Component: Step6PlanningPolicy },
      {
        id: "seven",
        title: "Review & publish",
        Component: Step7Review,
        validate: async () => ({ ok: true }),
      },
    ],
    [],
  );

  // Filter steps for the current supply_method path.
  const activeSteps = useMemo(() => {
    const setOrder = new Set(dynamicSteps);
    return steps.filter((s) =>
      setOrder.has(s.id as typeof dynamicSteps[number]),
    );
  }, [steps, dynamicSteps]);

  if (!isAdmin) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger-softer p-4 text-sm text-danger-fg">
        You need the <strong>admin</strong> role to use the new-product wizard.
      </div>
    );
  }

  return (
    <>
      <div className="mb-2">
        <Link
          href="/admin/items"
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-sops text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
          Items
        </Link>
        <span className="mx-2 text-fg-subtle">·</span>
        <Link
          href="/admin/items"
          className="text-xs text-fg-muted hover:text-fg"
        >
          Skip wizard — quick create
        </Link>
      </div>

      <Wizard<NewProductWizardState>
        id="new-product"
        eyebrow="Admin · new product"
        title="New product wizard"
        description="Guided 7-step flow to create a new item + aliases + BOM + supplier-items + policy review. BOUGHT_FINISHED items skip the BOM and component steps."
        steps={activeSteps}
        initialState={{
          aliases: [],
          create_bom: true,
          bom_lines: [],
          supplier_items_created: [],
        }}
        onSaveDraft={async (_s) => {
          // localStorage persistence is handled inside <Wizard>; this callback
          // is surfaced so future cycles can add server-side draft storage.
          // For now just emit a console note.
          if (typeof window !== "undefined") {
            window.alert(
              "Draft saved locally. Re-enter /admin/products/new to resume.",
            );
          }
        }}
        onComplete={async (s) => {
          const { item_id } = await executePublish(s);
          // Invalidate everything the new item touches.
          void queryClient.invalidateQueries({ queryKey: ["admin", "items"] });
          void queryClient.invalidateQueries({ queryKey: ["admin", "bom_head"] });
          void queryClient.invalidateQueries({
            queryKey: ["admin", "bom_version"],
          });
          void queryClient.invalidateQueries({
            queryKey: ["admin", "integration-sku-map"],
          });
          router.push(`/admin/products/${encodeURIComponent(item_id)}`);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Field helper
// ---------------------------------------------------------------------------

function Field({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/30 py-1.5">
      <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
      </span>
      <span className="text-sm text-fg">{value}</span>
    </div>
  );
}
