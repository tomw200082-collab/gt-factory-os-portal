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
      const res = await fetch(
        `/api/supplier-items?component_id=${encodeURIComponent(componentId)}`,
      );
      if (!res.ok) throw new Error(`supplier-items: ${res.status}`);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md overflow-auto rounded-md bg-white p-4 shadow-lg max-h-[90vh]">
        <h3 className="mb-2 font-semibold">תיקון רכיב</h3>
        {errorKind === "stale" && (
          <div className="mb-2 rounded bg-yellow-100 p-2 text-sm">
            הספק עודכן ע&quot;י משתמש אחר. רענן ובחר שוב.
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
          <div className="mb-2 rounded bg-red-100 p-2 text-sm">
            Database invariant violation — please reload and retry. If this
            persists, contact admin.
          </div>
        )}
        {errorKind === "other" && (
          <div className="mb-2 rounded bg-red-100 p-2 text-sm">
            שגיאה. נסה שוב.
          </div>
        )}

        {mode === "list" && (
          <>
            {rows.length === 0 ? (
              <p className="text-sm text-gray-600">אין סורסינג זמין לרכיב זה.</p>
            ) : (
              <ul className="space-y-1">
                {rows.map((r) => {
                  const isStalePrice =
                    r.is_primary &&
                    (r.std_cost_per_inv_uom === null || r.std_cost_per_inv_uom === "");
                  return (
                    <li key={r.supplier_item_id} className="border-b py-1">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="primary-candidate"
                          checked={selectedId === r.supplier_item_id}
                          onChange={() => setSelectedId(r.supplier_item_id)}
                          aria-label={r.supplier_name}
                        />
                        <span>
                          {r.supplier_name}
                          {r.is_primary && " (primary)"} · cost{" "}
                          {r.std_cost_per_inv_uom ?? "—"} · lead{" "}
                          {r.lead_time_days ?? "—"}d · MOQ {r.moq ?? "—"}
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
                            className="ml-6 mt-1 text-xs text-blue-700 underline"
                          >
                            Update price
                          </button>
                        )}
                      {editingPriceRowId === r.supplier_item_id && (
                        <div className="ml-6 mt-1 flex items-center gap-1">
                          <label className="text-xs">
                            new price
                            <input
                              aria-label="new price"
                              value={newPrice}
                              onChange={(e) => setNewPrice(e.target.value)}
                              inputMode="decimal"
                              className="ml-1 w-20 rounded border px-1"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              updatePrice.mutate({ row: r, price: newPrice })
                            }
                            className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white"
                          >
                            Save price
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPriceRowId(null);
                              setNewPrice("");
                            }}
                            className="rounded border px-2 py-0.5 text-xs"
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
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded border px-3 py-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setMode("add")}
                className="rounded border px-3 py-1"
              >
                + Add new supplier
              </button>
              {rows.length > 0 && canSwap && (
                <button
                  type="button"
                  onClick={() => setMode("swap-confirm")}
                  className="rounded border px-3 py-1"
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
                className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </>
        )}

        {mode === "add" && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              addLink.mutate();
            }}
          >
            {rows.length === 0 && (
              <p className="text-sm text-gray-600">אין סורסינג זמין לרכיב זה.</p>
            )}
            <div className="block text-sm">
              <label htmlFor="qfd-b-supplier_id">supplier_id</label>
              <input
                id="qfd-b-supplier_id"
                value={bSupplierId}
                onChange={(e) => setBSupplierId(e.target.value)}
                className="mt-1 block w-full rounded border px-2 py-1"
              />
            </div>
            <div className="block text-sm">
              <label htmlFor="qfd-b-std_cost">std_cost</label>
              <input
                id="qfd-b-std_cost"
                value={bStdCost}
                onChange={(e) => setBStdCost(e.target.value)}
                inputMode="decimal"
                className="mt-1 block w-full rounded border px-2 py-1"
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input
                id="qfd-b-set-primary"
                type="checkbox"
                checked={bSetPrimary}
                onChange={(e) => setBSetPrimary(e.target.checked)}
              />
              <label htmlFor="qfd-b-set-primary">Set as primary</label>
            </div>
            <div className="flex gap-2">
              {rows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMode("list")}
                  className="rounded border px-3 py-1"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded border px-3 py-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addLink.isPending}
                className="rounded bg-blue-600 px-3 py-1 text-white"
              >
                Add link
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
