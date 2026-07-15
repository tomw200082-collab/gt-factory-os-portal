"use client";

// ---------------------------------------------------------------------------
// Operating-costs drawer — Tranche 128.
//
// The in-page editor for the operating-cost model behind CM2 (true gross
// margin): labor, overhead, channel fees, shipping — and any future line Tom
// adds. Edits are sent as ONE batch to PATCH /api/economics/operating-costs,
// which the backend applies in a single all-or-nothing transaction with an
// audit-log row per line (corridor SPEC §V.10/§V.15).
//
// The drawer renders and edits; it computes nothing. Every number shown on
// the board reflects the server's recomputation after save (SPEC §V.1).
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Coins, AlertTriangle } from "lucide-react";

export interface CostModelRow {
  cost_key: string;
  scope: string;
  basis: "per_unit_ils" | "pct_of_revenue" | "per_order_ils";
  value: string;
  label_en: string;
  active: boolean;
  updated_at: string;
}

interface EditableLine {
  cost_key: string;
  scope: string;
  basis: CostModelRow["basis"];
  value: string; // input text; validated on save
  label_en: string;
  active: boolean;
}

const BASIS_LABEL: Record<CostModelRow["basis"], string> = {
  per_unit_ils: "₪ / unit",
  pct_of_revenue: "% of price",
  per_order_ils: "₪ / order",
};

const BASIS_HELP: Record<CostModelRow["basis"], string> = {
  per_unit_ils: "Added per sold unit (direct labor, per-unit overhead).",
  pct_of_revenue: "Percent of the unit price (payment / channel fees). Max 100.",
  per_order_ils: "Per order, allocated by orders ÷ units. Products with no sales get 0.",
};

function toEditable(rows: CostModelRow[]): EditableLine[] {
  return rows.map((r) => ({
    cost_key: r.cost_key,
    scope: r.scope,
    basis: r.basis,
    value: r.value,
    label_en: r.label_en,
    active: r.active,
  }));
}

export function OperatingCostsDrawer({
  open,
  onClose,
  costModel,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  costModel: CostModelRow[];
  onSaved: () => void;
}): JSX.Element | null {
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLine, setNewLine] = useState<EditableLine>({
    cost_key: "",
    scope: "GLOBAL",
    basis: "per_unit_ils",
    value: "0",
    label_en: "",
    active: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Unsaved edits? Escape/backdrop must not silently discard them.
  const dirty = useMemo(
    () => adding || JSON.stringify(lines) !== JSON.stringify(toEditable(costModel)),
    [lines, adding, costModel],
  );

  // Re-seed the editable copy each time the drawer opens on fresh data.
  useEffect(() => {
    if (open) {
      setLines(toEditable(costModel));
      setError(null);
      setAdding(false);
      setConfirmDiscard(false);
    }
  }, [open, costModel]);

  // Dialog focus management: capture the trigger, move focus in on open,
  // give it back on close.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      closeBtnRef.current?.focus();
    } else {
      restoreFocusRef.current?.focus?.();
      restoreFocusRef.current = null;
    }
  }, [open]);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (dirtyRef.current) setConfirmDiscard(true);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Keep Tab inside the dialog (aria-modal contract).
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const els = panelRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (els.length === 0) return;
    const first = els[0]!;
    const last = els[els.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const invalid = useMemo(() => {
    const all = adding && newLine.cost_key ? [...lines, newLine] : lines;
    return all.some((l) => {
      const v = Number(l.value);
      if (!Number.isFinite(v) || v < 0) return true;
      if (l.basis === "pct_of_revenue" && v > 100) return true;
      return false;
    });
  }, [lines, adding, newLine]);

  if (!open) return null;

  const update = (idx: number, patch: Partial<EditableLine>) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload = [...lines];
    if (adding && newLine.cost_key.trim() && newLine.label_en.trim()) {
      payload.push({
        ...newLine,
        cost_key: newLine.cost_key.trim().toUpperCase().replace(/\s+/g, "_"),
      });
    }
    try {
      const res = await fetch("/api/economics/operating-costs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: payload.map((l) => ({
            cost_key: l.cost_key,
            scope: l.scope,
            basis: l.basis,
            value: Number(l.value),
            label_en: l.label_en,
            active: l.active,
          })),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; validation_errors?: { message: string }[] }
          | null;
        const msg =
          body?.error ??
          body?.validation_errors?.map((v) => v.message).join("; ") ??
          `Save failed (HTTP ${res.status}).`;
        throw new Error(msg);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const globals = lines.filter((l) => l.scope === "GLOBAL");
  const overrides = lines.filter((l) => l.scope !== "GLOBAL");

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Operating costs" data-testid="operating-costs-drawer">
      {/* backdrop */}
      <div className="db-drawer-backdrop absolute inset-0 bg-black/30" onClick={requestClose} aria-hidden />
      {/* panel */}
      <div ref={panelRef} onKeyDown={trapTab} className="db-drawer-panel absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border/60 bg-bg shadow-pop">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft">
              <Coins className="h-4 w-4 text-accent" />
            </span>
            <div>
              <div className="text-sm font-bold tracking-tight text-fg-strong">Operating costs</div>
              <div className="text-2xs text-fg-subtle">Feeds true margin. All amounts ex-VAT.</div>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-bg-subtle/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <p className="text-xs leading-relaxed text-fg-subtle">
            These lines are applied on top of material cost by the server — the
            board recalculates the moment you save. A line only counts while it
            is <b className="text-fg">on</b>.
          </p>

          <div className="space-y-2.5">
            {globals.map((l) => {
              const idx = lines.indexOf(l);
              const v = Number(l.value);
              const bad = !Number.isFinite(v) || v < 0 || (l.basis === "pct_of_revenue" && v > 100);
              return (
                <div key={`${l.cost_key}|${l.scope}`} className={`rounded-xl border p-3 ${l.active ? "border-border/60 bg-bg" : "border-border/40 bg-bg-subtle/40"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-fg-strong">{l.label_en}</div>
                      <div className="text-3xs uppercase tracking-sops text-fg-subtle">{BASIS_LABEL[l.basis]}</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={l.active}
                      aria-label={`${l.label_en} on/off`}
                      onClick={() => update(idx, { active: !l.active })}
                      className="-m-2.5 shrink-0 rounded-xl p-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      <span className={`relative block h-6 w-11 rounded-full transition-colors ${l.active ? "bg-success" : "bg-bg-muted"}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${l.active ? "left-[22px]" : "left-0.5"}`} aria-hidden />
                      </span>
                    </button>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <label className="sr-only" htmlFor={`v-${l.cost_key}-${l.scope}`}>{l.label_en} value</label>
                    <input
                      id={`v-${l.cost_key}-${l.scope}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={l.basis === "pct_of_revenue" ? 100 : undefined}
                      step="0.01"
                      value={l.value}
                      onChange={(e) => update(idx, { value: e.target.value })}
                      className={`w-32 rounded-lg border px-2.5 py-1.5 text-sm tabular-nums text-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${bad ? "border-danger/60 bg-danger-softer/40" : "border-border/60 bg-bg"}`}
                    />
                    <select
                      aria-label={`${l.label_en} basis`}
                      value={l.basis}
                      onChange={(e) => update(idx, { basis: e.target.value as EditableLine["basis"] })}
                      className="rounded-lg border border-border/60 bg-bg px-2 py-1.5 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      {(Object.keys(BASIS_LABEL) as EditableLine["basis"][]).map((b) => (
                        <option key={b} value={b}>{BASIS_LABEL[b]}</option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1.5 text-3xs leading-relaxed text-fg-subtle">{BASIS_HELP[l.basis]}</p>
                </div>
              );
            })}
          </div>

          {overrides.length > 0 ? (
            <div>
              <div className="mb-1.5 text-2xs font-semibold uppercase tracking-sops text-fg-subtle">Per-product overrides</div>
              <div className="space-y-2">
                {overrides.map((l) => {
                  const idx = lines.indexOf(l);
                  return (
                    <div key={`${l.cost_key}|${l.scope}`} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-bg-subtle/40 px-3 py-2">
                      <div className="min-w-0 text-xs">
                        <div className="truncate font-medium text-fg">{l.label_en} — {l.scope}</div>
                        <div className="text-3xs text-fg-subtle">{BASIS_LABEL[l.basis]} · replaces the global line</div>
                      </div>
                      <input
                        aria-label={`${l.cost_key} override value`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={l.value}
                        onChange={(e) => update(idx, { value: e.target.value })}
                        className="w-24 rounded-lg border border-border/60 bg-bg px-2 py-1 text-sm tabular-nums"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* add line */}
          {adding ? (
            <div className="rounded-xl border border-dashed border-border/70 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xs font-semibold uppercase tracking-sops text-fg-subtle">New cost line</span>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setNewLine({ cost_key: "", scope: "GLOBAL", basis: "per_unit_ils", value: "0", label_en: "", active: true }); }}
                  className="text-3xs font-medium text-fg-subtle underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  Discard
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  aria-label="New line name"
                  placeholder="Name (e.g. Insurance)"
                  value={newLine.label_en}
                  onChange={(e) => setNewLine((n) => ({ ...n, label_en: e.target.value, cost_key: n.cost_key || e.target.value }))}
                  className="col-span-2 rounded-lg border border-border/60 bg-bg px-2.5 py-1.5 text-sm"
                />
                <input
                  aria-label="New line value"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={newLine.value}
                  onChange={(e) => setNewLine((n) => ({ ...n, value: e.target.value }))}
                  className="rounded-lg border border-border/60 bg-bg px-2.5 py-1.5 text-sm tabular-nums"
                />
                <select
                  aria-label="New line basis"
                  value={newLine.basis}
                  onChange={(e) => setNewLine((n) => ({ ...n, basis: e.target.value as EditableLine["basis"] }))}
                  className="rounded-lg border border-border/60 bg-bg px-2 py-1.5 text-xs"
                >
                  {(Object.keys(BASIS_LABEL) as EditableLine["basis"][]).map((b) => (
                    <option key={b} value={b}>{BASIS_LABEL[b]}</option>
                  ))}
                </select>
              </div>
              <p className="mt-1.5 text-3xs text-fg-subtle">{BASIS_HELP[newLine.basis]}</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs font-medium text-fg-subtle transition-colors hover:border-fg/30 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <Plus className="h-3.5 w-3.5" /> Add cost line
            </button>
          )}

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-softer/50 px-3 py-2 text-xs text-danger-fg" role="alert">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        {confirmDiscard ? (
          <div className="flex items-center justify-between gap-2 border-t border-warning/40 bg-warning-softer/40 px-4 py-3" role="alertdialog" aria-label="Discard unsaved changes?">
            <span className="text-xs font-medium text-warning-fg">Discard unsaved changes?</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-bg-subtle/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => { setConfirmDiscard(false); onClose(); }}
                className="rounded-lg border border-warning/50 bg-bg px-3.5 py-2 text-sm font-semibold text-warning-fg shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                Discard changes
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-3">
            <span className="text-3xs text-fg-subtle">Saved as one batch · every change is audit-logged.</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-lg px-3 py-2 text-sm font-medium text-fg-subtle transition-colors hover:bg-bg-subtle/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || invalid}
                title={invalid ? "Fix the highlighted values above before saving" : undefined}
                className="rounded-lg border border-fg/15 bg-bg px-3.5 py-2 text-sm font-semibold text-fg-strong shadow-sm transition-all hover:-translate-y-px hover:border-fg/25 hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save costs"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
