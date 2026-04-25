// QuickFixDrawer — guided supplier/price fixes for ONE component.
// Three actions per spec §6.5:
//   A. Set existing supplier as primary (radio list → single PATCH).
//   B. Add new sourcing link (inline form → POST /api/supplier-items,
//      optionally chained with a PATCH is_primary: true).
//   C. Swap primary supplier (select → SwapPrimaryConfirm side-by-side
//      → same single PATCH as A).
// Inline price-update affordance on the primary row when std_cost is
// missing/stale.
//
// All atomicity belongs to the backend: a single PATCH per swap. The UI
// surfaces 409 STALE_ROW (refresh hint) and 409 from partial unique index
// (defense-in-depth banner) per spec §6.5.

"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminMutationError, patchEntity } from "@/lib/admin/mutations";
import { SwapPrimaryConfirm } from "./SwapPrimaryConfirm";

interface SupplierItemRow {
  supplier_item_id: string;
  supplier_id: string;
  supplier_name: string;
  component_id: string;
  component_name: string;
  component_status: "ACTIVE" | "INACTIVE";
  is_primary: boolean;
  std_cost_per_inv_uom: string | null;
  lead_time_days: number | null;
  moq: string | null;
  updated_at: string;
}

interface QuickFixDrawerProps {
  componentId: string;
  open: boolean;
  onClose: () => void;
}

type ErrorKind = null | "stale" | "unique" | "other";
type Mode = "list" | "add" | "swap-confirm" | "edit-price";

function randomKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function QuickFixDrawer({
  componentId,
  open,
  onClose,
}: QuickFixDrawerProps): JSX.Element | null {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [mode, setMode] = useState<Mode>("list");
  const [editingPriceRowId, setEditingPriceRowId] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState("");

  // Action B form state.
  const [bSupplierId, setBSupplierId] = useState("");
  const [bStdCost, setBStdCost] = useState("");
  const [bSetPrimary, setBSetPrimary] = useState(true);

  const rowsQuery = useQuery({
    queryKey: ["supplier-items", "by-component", componentId],
    queryFn: async (): Promise<SupplierItemRow[]> => {
      const url = `/api/supplier-items?component_id=${encodeURIComponent(componentId)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `supplier-items — HTTP ${res.status}\n${text.slice(0, 200)}`,
        );
      }
      const body = await res.json();
      return (body.rows ?? []) as SupplierItemRow[];
    },
    enabled: open,
  });

  const rows = useMemo(() => rowsQuery.data ?? [], [rowsQuery.data]);

  // Default mode: if no rows, jump to "add"; otherwise stay in "list".
  useEffect(() => {
    if (rowsQuery.isSuccess) {
      setMode((m) => (m === "list" && rows.length === 0 ? "add" : m));
      setBSetPrimary(rows.every((r) => !r.is_primary));
    }
  }, [rowsQuery.isSuccess, rows]);

  const promote = useMutation({
    mutationFn: async (row: SupplierItemRow) =>
      patchEntity({
        url: `/api/supplier-items/${encodeURIComponent(row.supplier_item_id)}`,
        fields: { is_primary: true },
        ifMatchUpdatedAt: row.updated_at,
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["supplier-items", "by-component", componentId],
      });
      setErrorKind(null);
      onClose();
    },
    onError: (e: Error) => {
      if (e instanceof AdminMutationError) {
        if (e.code === "STALE_ROW") setErrorKind("stale");
        else if (e.status === 409) setErrorKind("unique");
        else setErrorKind("other");
      } else {
        setErrorKind("other");
      }
    },
  });

  const updatePrice = useMutation({
    mutationFn: async (args: { row: SupplierItemRow; price: string }) =>
      patchEntity({
        url: `/api/supplier-items/${encodeURIComponent(args.row.supplier_item_id)}`,
        fields: { std_cost_per_inv_uom: args.price },
        ifMatchUpdatedAt: args.row.updated_at,
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["supplier-items", "by-component", componentId],
      });
      setEditingPriceRowId(null);
      setNewPrice("");
      setErrorKind(null);
    },
    onError: (e: Error) => {
      if (e instanceof AdminMutationError && e.code === "STALE_ROW") {
        setErrorKind("stale");
      } else {
        setErrorKind("other");
      }
    },
  });

  const addLink = useMutation({
    mutationFn: async () => {
      const postRes = await fetch("/api/supplier-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: bSupplierId,
          component_id: componentId,
          std_cost_per_inv_uom: bStdCost,
          idempotency_key: randomKey(),
        }),
      });
      if (!postRes.ok) throw new Error(`add-link: ${postRes.status}`);
      const created = (await postRes.json()) as SupplierItemRow;
      if (bSetPrimary) {
        await promote.mutateAsync(created);
      } else {
        qc.invalidateQueries({
          queryKey: ["supplier-items", "by-component", componentId],
        });
        onClose();
      }
      return created;
    },
    onError: (e: Error) => {
      if (e instanceof AdminMutationError) {
        if (e.code === "STALE_ROW") setErrorKind("stale");
        else if (e.status === 409) setErrorKind("unique");
        else setErrorKind("other");
      } else {
        setErrorKind("other");
      }
    },
  });

  if (!open) return null;

  const currentPrimary = rows.find((r) => r.is_primary) ?? null;
  const selected =
    selectedId !== null
      ? rows.find((r) => r.supplier_item_id === selectedId) ?? null
      : null;
  const canSwap =
    currentPrimary !== null &&
    selected !== null &&
    !selected.is_primary;

  return (
    <div
      role="dialog"
      aria-label="Quick fix"
      className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-md border border-border bg-bg-raised p-5 shadow-lg">
        <h3 className="mb-1 text-base font-semibold text-fg-strong">
          Fix supplier &amp; price
        </h3>
        <p className="mb-4 text-xs text-fg-muted">
          Resolve missing primary supplier or stale price for this component.
        </p>
        {errorKind === "stale" && (
          <div className="mb-3 rounded-sm border border-warning-border bg-warning-soft p-2 text-xs text-warning-fg">
            This row was updated by another user. Refresh and choose again.
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => {
                rowsQuery.refetch();
                setErrorKind(null);
                setSelectedId(null);
                setMode("list");
              }}
            >
              Refresh
            </button>
          </div>
        )}
        {errorKind === "unique" && (
          <div className="mb-3 rounded-sm border border-danger-border bg-danger-soft p-2 text-xs text-danger-fg">
            Database invariant violation — please reload and retry. If this
            persists, contact admin.
          </div>
        )}
        {errorKind === "other" && (
          <div className="mb-3 rounded-sm border border-danger-border bg-danger-soft p-2 text-xs text-danger-fg">
            Something went wrong. Please try again.
          </div>
        )}

        {mode === "list" && (
          <>
            {rows.length === 0 ? (
              <p className="text-sm text-fg-muted">
                No sourcing links exist for this component yet.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-sm border border-border">
                {rows.map((r) => {
                  const isStalePrice =
                    r.is_primary &&
                    (r.std_cost_per_inv_uom === null ||
                      r.std_cost_per_inv_uom === "");
                  return (
                    <li key={r.supplier_item_id} className="px-3 py-2">
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name="primary-candidate"
                          checked={selectedId === r.supplier_item_id}
                          onChange={() => setSelectedId(r.supplier_item_id)}
                          aria-label={r.supplier_name}
                          className="mt-0.5 h-4 w-4 border-border text-accent focus:ring-accent-ring"
                        />
                        <span className="flex-1">
                          <span className="block font-medium text-fg">
                            {r.supplier_name}
                            {r.is_primary && (
                              <span className="ml-2 rounded-sm bg-success-soft px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-sops text-success-fg">
                                Primary
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-3xs text-fg-muted">
                            Cost {r.std_cost_per_inv_uom ?? "—"} · Lead{" "}
                            {r.lead_time_days ?? "—"}d · MOQ {r.moq ?? "—"}
                          </span>
                        </span>
                      </label>
                      {isStalePrice &&
                        editingPriceRowId !== r.supplier_item_id && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPriceRowId(r.supplier_item_id);
                              setNewPrice("");
                            }}
                            className="ml-6 mt-2 text-xs font-medium text-accent hover:underline"
                          >
                            Update price
                          </button>
                        )}
                      {editingPriceRowId === r.supplier_item_id && (
                        <div className="ml-6 mt-2 flex items-center gap-1.5">
                          <label className="text-xs text-fg-muted">
                            New price
                            <input
                              aria-label="new price"
                              value={newPrice}
                              onChange={(e) => setNewPrice(e.target.value)}
                              inputMode="decimal"
                              className="ml-1.5 w-24 rounded-sm border border-border bg-bg px-1.5 py-0.5 font-mono tabular-nums text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent-ring"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              updatePrice.mutate({ row: r, price: newPrice })
                            }
                            className="rounded-sm border border-accent-border bg-accent px-2 py-0.5 text-xs font-medium text-accent-fg hover:bg-accent-hover"
                          >
                            Save price
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPriceRowId(null);
                              setNewPrice("");
                            }}
                            className="rounded-sm border border-border px-2 py-0.5 text-xs text-fg hover:bg-bg-subtle"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-sm border border-border bg-bg-raised px-3 py-1.5 text-sm text-fg hover:bg-bg-subtle"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setMode("add")}
                className="rounded-sm border border-border bg-bg-raised px-3 py-1.5 text-sm text-fg hover:bg-bg-subtle"
              >
                + Add new supplier
              </button>
              {rows.length > 0 && canSwap && (
                <button
                  type="button"
                  onClick={() => setMode("swap-confirm")}
                  className="rounded-sm border border-border bg-bg-raised px-3 py-1.5 text-sm text-fg hover:bg-bg-subtle"
                >
                  Swap primary
                </button>
              )}
              <button
                type="button"
                disabled={
                  selectedId === null ||
                  promote.isPending ||
                  (selected !== null && selected.is_primary)
                }
                onClick={() => {
                  if (selected) promote.mutate(selected);
                }}
                className="rounded-sm border border-accent-border bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {promote.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}

        {mode === "add" && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              addLink.mutate();
            }}
          >
            <div className="block text-sm">
              <label
                htmlFor="qfd-b-supplier_id"
                className="block text-fg-strong"
              >
                Supplier ID
              </label>
              <input
                id="qfd-b-supplier_id"
                value={bSupplierId}
                onChange={(e) => setBSupplierId(e.target.value)}
                className="mt-1 block w-full rounded-sm border border-border bg-bg px-2.5 py-1.5 font-mono text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent-ring"
                placeholder="e.g. SUP-ACME"
              />
            </div>
            <div className="block text-sm">
              <label
                htmlFor="qfd-b-std_cost"
                className="block text-fg-strong"
              >
                Standard cost (per inventory UOM)
              </label>
              <input
                id="qfd-b-std_cost"
                value={bStdCost}
                onChange={(e) => setBStdCost(e.target.value)}
                inputMode="decimal"
                className="mt-1 block w-full rounded-sm border border-border bg-bg px-2.5 py-1.5 font-mono tabular-nums text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent-ring"
                placeholder="0.00"
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input
                id="qfd-b-set-primary"
                type="checkbox"
                checked={bSetPrimary}
                onChange={(e) => setBSetPrimary(e.target.checked)}
                className="h-4 w-4 rounded-sm border-border text-accent focus:ring-accent-ring"
              />
              <label htmlFor="qfd-b-set-primary" className="text-fg">
                Set as primary supplier for this component
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              {rows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMode("list")}
                  className="rounded-sm border border-border bg-bg-raised px-3 py-1.5 text-sm text-fg hover:bg-bg-subtle"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-sm border border-border bg-bg-raised px-3 py-1.5 text-sm text-fg hover:bg-bg-subtle"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addLink.isPending || !bSupplierId}
                className="rounded-sm border border-accent-border bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {addLink.isPending ? "Adding…" : "Add sourcing link"}
              </button>
            </div>
          </form>
        )}

        {mode === "swap-confirm" && currentPrimary && selected && (
          <SwapPrimaryConfirm
            currentPrimary={currentPrimary}
            newPrimary={selected}
            onBack={() => setMode("list")}
            onConfirm={() => promote.mutate(selected)}
          />
        )}
      </div>
    </div>
  );
}
