"use client";

// ---------------------------------------------------------------------------
// <AssignPrimarySupplierDrawer>
//
// Single-step picker drawer used by the master detail pages (components and
// items) when a user wants to assign a primary supplier in one click.
//
// Behaviour:
//   - User picks a supplier from the active suppliers list.
//   - On submit, if a supplier_item already exists for this supplier+target
//     (same component_id or item_id), promote it via PATCH is_primary=true
//     using its updated_at as the optimistic-concurrency token. This avoids
//     leaving two rows behind.
//   - If a different supplier_item is currently primary, demote it first
//     (the supplier_items table has a partial unique index that allows at
//     most one is_primary=true row per component / per item).
//   - If no supplier_item exists yet for the chosen supplier, POST a new
//     row with { is_primary: true, approval_status: 'approved',
//     pack_conversion: 1 } so the readiness gate sees a valid link.
//
// Reused from the older /admin/components list-page pattern
// (see supplierAssignMutation in admin/components/page.tsx) and from the
// QuickCreateSupplierItem drawer.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/overlays/Drawer";
import { EntityPickerPlus, type EntityOption } from "@/components/fields/EntityPickerPlus";
import { AdminMutationError, patchEntity } from "@/lib/admin/mutations";

export interface ExistingSupplierItem {
  supplier_item_id: string;
  supplier_id: string;
  is_primary: boolean;
  updated_at: string;
}

export interface AssignPrimarySupplierDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Called after the primary supplier is successfully assigned. */
  onAssigned: () => void;
  /** Active suppliers, already mapped to picker options (label = name, not id). */
  suppliers: EntityOption[];
  /**
   * Existing supplier_items rows for THIS target (component or item). Used to
   * (a) detect the current primary so we can demote it, and (b) reuse a row
   * when one already exists for the chosen supplier instead of creating a
   * duplicate.
   */
  existingSupplierItems: ExistingSupplierItem[];
  /** Polymorphic target — exactly one of these must be provided. */
  componentId?: string;
  itemId?: string;
  /** Friendly noun for messaging (e.g. "raw material", "product"). */
  targetNoun?: string;
}

export function AssignPrimarySupplierDrawer({
  open,
  onClose,
  onAssigned,
  suppliers,
  existingSupplierItems,
  componentId,
  itemId,
  targetNoun = "item",
}: AssignPrimarySupplierDrawerProps): JSX.Element {
  const [supplierId, setSupplierId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSupplierId("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const currentPrimary = useMemo(
    () => existingSupplierItems.find((si) => si.is_primary) ?? null,
    [existingSupplierItems],
  );

  const matchForChosen = useMemo(
    () =>
      supplierId
        ? existingSupplierItems.find((si) => si.supplier_id === supplierId) ?? null
        : null,
    [existingSupplierItems, supplierId],
  );

  const supplierOptions = suppliers;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      setError("Please pick a supplier.");
      return;
    }
    if (!componentId && !itemId) {
      setError("Internal error: no target component or item set.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // Case 1: a supplier_item already exists for this exact supplier — just
      // promote it to primary (no duplicate row).
      if (matchForChosen) {
        if (matchForChosen.is_primary) {
          // Already primary — nothing to do.
          onAssigned();
          onClose();
          return;
        }
        // Demote the current primary (if any) first to satisfy the partial
        // unique index on (component_id, is_primary=true) /
        // (item_id, is_primary=true).
        if (currentPrimary && currentPrimary.supplier_item_id !== matchForChosen.supplier_item_id) {
          await patchEntity({
            url: `/api/supplier-items/${encodeURIComponent(currentPrimary.supplier_item_id)}`,
            fields: { is_primary: false },
            ifMatchUpdatedAt: currentPrimary.updated_at,
          });
        }
        await patchEntity({
          url: `/api/supplier-items/${encodeURIComponent(matchForChosen.supplier_item_id)}`,
          fields: { is_primary: true },
          ifMatchUpdatedAt: matchForChosen.updated_at,
        });
        onAssigned();
        onClose();
        return;
      }

      // Case 2: no supplier_item exists for this supplier yet. Demote current
      // primary if any, then POST a new row as primary.
      if (currentPrimary) {
        await patchEntity({
          url: `/api/supplier-items/${encodeURIComponent(currentPrimary.supplier_item_id)}`,
          fields: { is_primary: false },
          ifMatchUpdatedAt: currentPrimary.updated_at,
        });
      }
      const res = await fetch("/api/supplier-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          supplier_id: supplierId,
          component_id: componentId ?? null,
          item_id: itemId ?? null,
          is_primary: true,
          approval_status: "approved",
          pack_conversion: 1,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { message?: string; code?: string }
        | null;
      if (!res.ok) {
        const msg =
          (body && typeof body === "object" && body.message) ||
          `Could not assign supplier (HTTP ${res.status}).`;
        const code =
          body && typeof body === "object" && body.code ? String(body.code) : undefined;
        throw new AdminMutationError(res.status, msg, code, body);
      }
      onAssigned();
      onClose();
    } catch (err) {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "Could not assign supplier. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="Assign primary supplier"
      description={`Pick the supplier you buy this ${targetNoun} from. They will be marked primary and used for purchase recommendations.`}
      width="md"
    >
      {error ? (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger-softer p-3 text-xs text-danger-fg">
          {error}
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Supplier
          </span>
          <EntityPickerPlus
            value={supplierId}
            onChange={(opt) => setSupplierId(opt?.id ?? "")}
            options={supplierOptions}
            placeholder="Search suppliers…"
            entityName="supplier"
          />
          {currentPrimary ? (
            <p className="mt-1 text-xs text-fg-subtle">
              The current primary supplier will be demoted automatically.
            </p>
          ) : null}
          {matchForChosen && !matchForChosen.is_primary ? (
            <p className="mt-1 text-xs text-fg-subtle">
              This supplier is already linked — it will be promoted to primary
              instead of creating a duplicate row.
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/70 pt-4">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || !supplierId}
          >
            {submitting ? "Assigning…" : "Assign primary supplier"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
