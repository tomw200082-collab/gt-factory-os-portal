// BomLineAddDrawer — modal for adding a new line to a DRAFT BOM version.
// Fetches the components list and shows a searchable picker.
// POSTs: { final_component_id, quantity_per (number), idempotency_key }

"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";

interface BomLineAddDrawerProps {
  versionId: string;
  open: boolean;
  onClose: () => void;
}

interface ComponentRow {
  component_id: string;
  component_name: string;
  inventory_uom: string | null;
  status: string;
}

function randomKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function BomLineAddDrawer({
  versionId,
  open,
  onClose,
}: BomLineAddDrawerProps): JSX.Element | null {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ComponentRow | null>(null);
  const [qty, setQty] = useState("1");
  const [error, setError] = useState<string | null>(null);

  const componentsQuery = useQuery({
    queryKey: ["components", "for-bom-add"],
    queryFn: async (): Promise<ComponentRow[]> => {
      const res = await fetch("/api/components?limit=1000");
      if (!res.ok) throw new Error(`components: ${res.status}`);
      const body = await res.json();
      return (body.rows ?? []) as ComponentRow[];
    },
    enabled: open,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = (componentsQuery.data ?? []).filter((c) => c.status !== "INACTIVE");
    if (!q) return all;
    return all.filter(
      (c) =>
        c.component_name.toLowerCase().includes(q) ||
        c.component_id.toLowerCase().includes(q),
    );
  }, [componentsQuery.data, search]);

  const post = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No component selected");
      const parsedQty = parseFloat(qty);
      if (isNaN(parsedQty) || parsedQty <= 0)
        throw new Error("Quantity must be a positive number");
      const res = await fetch(
        `/api/boms/versions/${encodeURIComponent(versionId)}/lines`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            final_component_id: selected.component_id,
            quantity_per: parsedQty,
            idempotency_key: randomKey(),
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = (body as { message?: string } | null)?.message;
        throw new Error(msg ?? `Add failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boms", "lines", versionId] });
      setSelected(null);
      setSearch("");
      setQty("1");
      setError(null);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleClose() {
    if (post.isPending) return;
    setSelected(null);
    setSearch("");
    setQty("1");
    setError(null);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Add component"
      className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="flex w-full max-w-md flex-col rounded-md border border-border bg-bg-raised shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-fg-strong">Add component</h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-sm p-1 text-fg-muted hover:bg-bg-subtle hover:text-fg"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => { e.preventDefault(); post.mutate(); }}
        >
          {/* Component picker */}
          <div>
            <label className="mb-1.5 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Component
            </label>

            {selected ? (
              /* Selected state */
              <div className="flex items-center justify-between rounded-sm border border-accent bg-accent-softer px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-fg">
                    {selected.component_name}
                  </div>
                  <div className="font-mono text-3xs text-fg-subtle">
                    {selected.component_id}
                    {selected.inventory_uom ? ` · ${selected.inventory_uom}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelected(null); setSearch(""); }}
                  className="ml-2 shrink-0 rounded-sm p-1 text-fg-muted hover:bg-bg-subtle hover:text-fg"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </div>
            ) : (
              /* Search + list */
              <div className="rounded-sm border border-border bg-bg">
                <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
                  <Search className="h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={2} />
                  <input
                    autoFocus
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or ID…"
                    className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-muted focus:outline-none"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="shrink-0 text-fg-muted hover:text-fg"
                    >
                      <X className="h-3 w-3" strokeWidth={2} />
                    </button>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {componentsQuery.isLoading ? (
                    <div className="px-3 py-4 text-center text-xs text-fg-muted">
                      Loading components…
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-fg-muted">
                      {search ? "No matching components" : "No active components"}
                    </div>
                  ) : (
                    filtered.map((c) => (
                      <button
                        key={c.component_id}
                        type="button"
                        onClick={() => setSelected(c)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-bg-subtle"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm text-fg">
                            {c.component_name}
                          </div>
                          <div className="font-mono text-3xs text-fg-subtle">
                            {c.component_id}
                          </div>
                        </div>
                        {c.inventory_uom && (
                          <span className="ml-2 shrink-0 rounded-sm bg-bg-subtle px-1.5 py-0.5 font-mono text-3xs text-fg-muted">
                            {c.inventory_uom}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label
              htmlFor="bom-add-qty"
              className="mb-1.5 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
            >
              Quantity per batch
              {selected?.inventory_uom ? ` (${selected.inventory_uom})` : ""}
            </label>
            <input
              id="bom-add-qty"
              type="text"
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-sm border border-border bg-bg px-2.5 py-1.5 font-mono tabular-nums text-sm text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent-ring"
              placeholder="e.g. 0.5"
            />
          </div>

          {error && (
            <div className="rounded-sm border border-danger-border bg-danger-soft p-2 text-xs text-danger-fg">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={post.isPending}
              className="rounded-sm border border-border bg-bg-raised px-3 py-1.5 text-sm text-fg hover:bg-bg-subtle disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={post.isPending || !selected || !qty}
              className="rounded-sm border border-accent-border bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {post.isPending ? "Adding…" : "Add component"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
