"use client";

// ---------------------------------------------------------------------------
// Production Actual — operator form (live API backed).
//
// Endgame Phase B2 (crystalline-drifting-dusk §B.B2):
//   - CLAUDE.md §"Production reporting v1" locked semantics:
//       output_qty + scrap_qty + notes only; system computes standard
//       consumption from pinned BOM version; NO manual per-component actual.
//   - Step 1 — Pick item: dropdown of items filtered to
//       supply_method ∈ {MANUFACTURED, REPACK} (client-side filter against
//       GET /api/items?status=ACTIVE&limit=1000). Selecting item and
//       clicking "Open" calls GET /api/production-actuals/open?item_id=<id>
//       which returns pinned bom_version_id + bom_lines snapshot.
//   - Step 2 — Enter qty + submit: form shows pinned BOM version id +
//       expandable "expected consumption preview" panel that multiplies
//       bom_lines × (output_qty + scrap_qty) / bom_final_output_qty on the
//       client (purely informational; server re-explodes authoritatively).
//       Submit POSTs to /api/production-actuals with bom_version_id_pinned
//       carried from Step 1.
//   - 409 conflict handling:
//       STALE_BOM_VERSION -> "BOM changed while this form was open" + restart
//       WRONG_SUPPLY_METHOD -> "This item is not manufactured/repacked"
//       UOM_MISMATCH / other -> show reason_code + detail
//   - Role-gate defense: planner/viewer see the page (middleware allows, but
//       backend returns 403); happy path is operator + admin.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { useSession } from "@/lib/auth/session-provider";

// ---------------------------------------------------------------------------
// Production Actual contract — inlined.
//
// Mirror of api/src/production-actuals/schemas.ts. Inlined (rather than
// imported from src/lib/contracts/production-actual.ts) because that file
// is held out of the committed tree pending the Gate-3 commit-hygiene
// tranche. Keep byte-aligned with upstream schema; drift is a bug.
// ---------------------------------------------------------------------------

interface BomLineSnapshot {
  line_id: string;
  component_id: string;
  component_name: string;
  final_component_qty: string; // preserves precision
  component_uom: string | null;
}

interface ProductionActualOpenResponse {
  item_id: string;
  item_name: string;
  supply_method: "MANUFACTURED" | "REPACK";
  output_uom_default: string;
  bom_version_id_pinned: string;
  bom_head_id: string;
  bom_version_label: string;
  bom_final_output_qty: string;
  bom_final_output_uom: string;
  bom_lines: BomLineSnapshot[];
}

interface ProductionActualSubmit {
  idempotency_key: string;
  event_at: string;
  item_id: string;
  bom_version_id_pinned: string;
  output_qty: number;
  scrap_qty: number;
  output_uom: string;
  notes: string | null;
}

interface ProductionActualCommitted {
  submission_id: string;
  status: "posted";
  event_at: string;
  posted_at: string;
  item_id: string;
  bom_version_id_pinned: string;
  output_qty: string;
  scrap_qty: string;
  output_uom: string;
  output_ledger_row_id: string;
  scrap_ledger_row_id: string | null;
  consumption: Array<{
    component_id: string;
    consumption_qty: string;
    component_uom: string | null;
    stock_ledger_movement_id: string;
  }>;
  idempotent_replay: boolean;
}

interface ItemRow {
  item_id: string;
  item_name: string;
  status: string;
  supply_method: string;
  sales_uom: string | null;
}

type ListEnvelope<T> = { rows: T[]; count: number };

// ---------------------------------------------------------------------------
// History row — mirrors GET /api/v1/queries/production-actuals response shape
// (W1 backend; being deployed in parallel by W1).
// ---------------------------------------------------------------------------
interface ProductionActualListRow {
  submission_id: string;
  item_id: string;
  item_name: string;
  output_qty: string;
  scrap_qty: string;
  output_uom: string;
  bom_version_label: string;
  event_at: string;
  posted_at: string;
  consumption_count: number;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function nowLocalDateTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pa_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${url} failed (HTTP ${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

type Phase = "pick" | "entering" | "submitting" | "done";
interface DoneState {
  kind: "success" | "error" | "stale";
  message: string;
  detail?: string;
}

// Decimal-string arithmetic helpers (keep server-side precision intact for
// the preview panel; the server re-explodes authoritatively on submit).
function stringDiv(num: string, denom: string, prodQty: number): string {
  const n = Number(num);
  const d = Number(denom);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return "?";
  const r = (n * prodQty) / d;
  // 4dp is plenty for a preview UI; server precision is qty_8dp.
  return r.toFixed(4);
}

export default function ProductionActualPage() {
  const { session } = useSession();
  const canSubmit = session.role === "operator" || session.role === "admin";

  const queryClient = useQueryClient();

  const historyQuery = useQuery<ListEnvelope<ProductionActualListRow>>({
    queryKey: ["production-actuals", "history"],
    queryFn: () =>
      fetch("/api/production-actuals/history?limit=10", {
        headers: { Accept: "application/json" },
      }).then((r) => {
        // Graceful degrade: if endpoint not yet deployed, surface nothing.
        if (!r.ok) throw new Error(`history ${r.status}`);
        return r.json() as Promise<ListEnvelope<ProductionActualListRow>>;
      }),
    staleTime: 60_000,
    // Do not throw to error boundary on 404 / 500 — endpoint may not be live yet.
    retry: false,
  });

  const historyRows = historyQuery.data?.rows ?? [];

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["master", "items", "PRODUCIBLE"],
    queryFn: () => fetchJson("/api/items?status=ACTIVE&limit=1000"),
  });

  // Filter to items the Production Actual form applies to — MANUFACTURED or
  // REPACK. BOUGHT_FINISHED is explicitly rejected by the handler (409
  // WRONG_SUPPLY_METHOD) with a defense-in-depth DB trigger behind it.
  const producibleItems = useMemo<ItemRow[]>(() => {
    const rows = itemsQuery.data?.rows ?? [];
    return rows
      .filter(
        (r) => r.supply_method === "MANUFACTURED" || r.supply_method === "REPACK",
      )
      .sort((a, b) => a.item_name.localeCompare(b.item_name));
  }, [itemsQuery.data]);

  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("pick");
  const [snapshot, setSnapshot] = useState<ProductionActualOpenResponse | null>(
    null,
  );
  const [eventAt, setEventAt] = useState<string>(nowLocalDateTime());
  const [outputQty, setOutputQty] = useState<string>("");
  const [scrapQty, setScrapQty] = useState<string>("0");
  const [outputUom, setOutputUom] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [previewExpanded, setPreviewExpanded] = useState<boolean>(false);
  const [done, setDone] = useState<DoneState | null>(null);

  const loading = itemsQuery.isLoading;
  const loadErr = itemsQuery.error;

  async function handleOpen(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setDone(null);
    if (!selectedItemId) {
      setDone({ kind: "error", message: "Choose an item to produce." });
      return;
    }
    setPhase("submitting");
    try {
      const q = new URLSearchParams({ item_id: selectedItemId });
      const res = await fetch(
        `/api/production-actuals/open?${q.toString()}`,
        { headers: { Accept: "application/json" } },
      );
      const body = await res.json().catch(() => null);
      if (res.ok && body && typeof body === "object") {
        const snap = body as ProductionActualOpenResponse;
        setSnapshot(snap);
        setOutputUom(snap.output_uom_default);
        setPhase("entering");
      } else {
        const detail = body ? JSON.stringify(body) : `HTTP ${res.status}`;
        setDone({
          kind: "error",
          message: `Failed to open production snapshot (HTTP ${res.status}).`,
          detail,
        });
        setPhase("pick");
      }
    } catch (err) {
      setDone({
        kind: "error",
        message: "Network error opening snapshot.",
        detail: err instanceof Error ? err.message : String(err),
      });
      setPhase("pick");
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!snapshot) return;
    setDone(null);
    const outNum = Number(outputQty);
    const scrapNum = Number(scrapQty || "0");
    if (!Number.isFinite(outNum) || outNum < 0) {
      setDone({
        kind: "error",
        message: "Output quantity must be a non-negative number.",
      });
      return;
    }
    if (!Number.isFinite(scrapNum) || scrapNum < 0) {
      setDone({
        kind: "error",
        message: "Scrap quantity must be a non-negative number.",
      });
      return;
    }
    const envelope: ProductionActualSubmit = {
      idempotency_key: newIdempotencyKey(),
      event_at: new Date(eventAt).toISOString(),
      item_id: snapshot.item_id,
      bom_version_id_pinned: snapshot.bom_version_id_pinned,
      output_qty: outNum,
      scrap_qty: scrapNum,
      output_uom: outputUom,
      notes: notes ? notes : null,
    };
    setPhase("submitting");
    try {
      const res = await fetch("/api/production-actuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      });
      const body = await res.json().catch(() => null);
      if (
        body &&
        typeof body === "object" &&
        (body as { status?: unknown }).status === "posted"
      ) {
        const committed = body as ProductionActualCommitted;
        setDone({
          kind: "success",
          message: committed.idempotent_replay
            ? "Production already posted (idempotent replay)."
            : "Production posted — output, scrap, and consumption recorded.",
          detail: `submission_id=${committed.submission_id} · consumption_rows=${committed.consumption.length}`,
        });
        // Refresh the recent-runs history so the new submission appears immediately.
        void queryClient.invalidateQueries({
          queryKey: ["production-actuals", "history"],
        });
        resetFlow();
        return;
      }
      // 409 INSUFFICIENT_STOCK — check before generic reason_code handler
      if (
        res.status === 409 &&
        body &&
        typeof body === "object" &&
        (body as { error?: unknown }).error === "INSUFFICIENT_STOCK"
      ) {
        const insuffBody = body as {
          error: string;
          message?: string;
          shortfalls?: Array<{
            component_id: string;
            required_qty: string | number;
            available_qty: string | number;
          }>;
        };
        const shortfallLines = (insuffBody.shortfalls ?? [])
          .map(
            (s) =>
              `${s.component_id}: need ${s.required_qty}, have ${s.available_qty}`,
          )
          .join("; ");
        setDone({
          kind: "error",
          message: `Insufficient stock: ${shortfallLines || (insuffBody.message ?? "check component stock levels.")}`,
          detail: insuffBody.message,
        });
        setPhase("entering");
        return;
      }
      // 409 conflicts (other reason_codes)
      if (
        res.status === 409 &&
        body &&
        typeof body === "object" &&
        typeof (body as { reason_code?: unknown }).reason_code === "string"
      ) {
        const reason = (body as { reason_code: string; detail?: string }).reason_code;
        const detail = (body as { detail?: string }).detail ?? reason;
        if (reason === "STALE_BOM_VERSION") {
          setDone({
            kind: "stale",
            message:
              "The BOM for this item changed after this form was opened. Re-open the form to pin the new version.",
            detail,
          });
          setPhase("entering");
          return;
        }
        if (reason === "WRONG_SUPPLY_METHOD") {
          setDone({
            kind: "error",
            message:
              "This item is not manufactured or repacked — Production Actual does not apply.",
            detail,
          });
          setPhase("pick");
          return;
        }
        setDone({
          kind: "error",
          message: `Submit refused (${reason}).`,
          detail,
        });
        setPhase("entering");
        return;
      }
      // 503 break-glass
      if (res.status === 503) {
        setDone({
          kind: "error",
          message:
            "Break-glass active — platform writes are temporarily paused.",
          detail: body ? JSON.stringify(body) : "HTTP 503",
        });
        setPhase("entering");
        return;
      }
      // 401/403
      if (res.status === 401 || res.status === 403) {
        setDone({
          kind: "error",
          message:
            res.status === 401
              ? "Not authenticated — please sign in again."
              : "Not authorized — operator or admin role required.",
          detail: body ? JSON.stringify(body) : `HTTP ${res.status}`,
        });
        setPhase("entering");
        return;
      }
      // Fallback
      const detail = body ? JSON.stringify(body) : `HTTP ${res.status}`;
      setDone({
        kind: "error",
        message: `Submit failed (HTTP ${res.status}).`,
        detail,
      });
      setPhase("entering");
    } catch (err) {
      setDone({
        kind: "error",
        message: "Network error submitting production actual.",
        detail: err instanceof Error ? err.message : String(err),
      });
      setPhase("entering");
    }
  }

  function resetFlow(): void {
    setSnapshot(null);
    setOutputQty("");
    setScrapQty("0");
    setOutputUom("");
    setNotes("");
    setSelectedItemId("");
    setPhase("pick");
    setEventAt(nowLocalDateTime());
    setPreviewExpanded(false);
  }

  function restartFromStep1(): void {
    // Same as reset but keep the 'done' banner visible (used after
    // STALE_BOM_VERSION so the operator sees why they're restarting).
    setSnapshot(null);
    setOutputQty("");
    setScrapQty("0");
    setOutputUom("");
    setNotes("");
    setSelectedItemId("");
    setPhase("pick");
    setEventAt(nowLocalDateTime());
    setPreviewExpanded(false);
  }

  // Preview panel — multiplies bom_lines × (output + scrap) / bom_final_output.
  // Server re-explodes authoritatively; this is informational only.
  const previewRows = useMemo(() => {
    if (!snapshot) return [] as Array<{
      component_id: string;
      component_name: string;
      consumption_preview: string;
      component_uom: string | null;
    }>;
    const productionQty = Number(outputQty || "0") + Number(scrapQty || "0");
    if (!Number.isFinite(productionQty) || productionQty <= 0) return [];
    return snapshot.bom_lines.map((bl) => ({
      component_id: bl.component_id,
      component_name: bl.component_name,
      consumption_preview: stringDiv(
        bl.final_component_qty,
        snapshot.bom_final_output_qty,
        productionQty,
      ),
      component_uom: bl.component_uom,
    }));
  }, [snapshot, outputQty, scrapQty]);

  return (
    <>
      <WorkflowHeader
        eyebrow="Operator form"
        title="Production Actual"
        description="Report produced output + scrap. Standard consumption is computed server-side from the pinned BOM version. No manual per-component consumption in v1."
      />

      {!canSubmit ? (
        <div
          className="mb-4 rounded-md border border-warning/40 bg-warning-softer px-4 py-3 text-sm text-warning-fg"
          role="status"
        >
          <div className="font-medium">Read-only view.</div>
          <div className="mt-1 text-xs opacity-80">
            Your role is <code>{session.role}</code>. Only operators and admins
            can submit a Production Actual. Backend will return 403 on submit.
          </div>
        </div>
      ) : null}

      {done ? (
        <div
          className={
            "mb-4 rounded-md border px-4 py-3 text-sm " +
            (done.kind === "success"
              ? "border-success/40 bg-success-softer text-success-fg"
              : done.kind === "stale"
                ? "border-warning/40 bg-warning-softer text-warning-fg"
                : "border-danger/40 bg-danger-softer text-danger-fg")
          }
          role="status"
        >
          <div className="font-medium">{done.message}</div>
          {done.detail ? (
            <div className="mt-1 font-mono text-xs opacity-80">
              {done.detail}
            </div>
          ) : null}
          {done.kind === "stale" ? (
            <div className="mt-2">
              <button
                type="button"
                className="btn btn-sm"
                onClick={restartFromStep1}
              >
                Re-open form
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="p-5 text-sm text-fg-muted">Loading masters…</div>
      ) : loadErr ? (
        <div className="p-5 text-sm text-danger-fg">
          {(loadErr as Error).message}
        </div>
      ) : phase === "pick" ? (
        <form onSubmit={handleOpen} className="space-y-5">
          <SectionCard
            title="Step 1 — choose what you produced"
            description="Only MANUFACTURED and REPACK items are listed. The form pins the active BOM version at open time; if BOM changes before submit, the form will refuse and ask to re-open."
          >
            <div className="grid grid-cols-1 gap-3">
              <label className="block">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Item *
                </span>
                <select
                  className="input"
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  required
                >
                  <option value="">— select —</option>
                  <optgroup label="Manufactured">
                    {producibleItems
                      .filter((r) => r.supply_method === "MANUFACTURED")
                      .map((r) => (
                        <option key={r.item_id} value={r.item_id}>
                          {r.item_name} · {r.item_id}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Repack">
                    {producibleItems
                      .filter((r) => r.supply_method === "REPACK")
                      .map((r) => (
                        <option key={r.item_id} value={r.item_id}>
                          {r.item_name} · {r.item_id}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </label>
              <div className="text-xs text-fg-muted">
                {producibleItems.length} producible items ·{" "}
                {
                  producibleItems.filter((r) => r.supply_method === "MANUFACTURED")
                    .length
                }{" "}
                manufactured ·{" "}
                {
                  producibleItems.filter((r) => r.supply_method === "REPACK")
                    .length
                }{" "}
                repack
              </div>
            </div>
          </SectionCard>
          <div className="flex items-center justify-end gap-2">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!selectedItemId}
            >
              Open production snapshot
            </button>
          </div>
        </form>
      ) : phase === "entering" || phase === "submitting" || phase === "done" ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <SectionCard
            title="Step 2 — enter produced output"
            description="Output quantity is what you produced good. Scrap quantity is material consumed but not usable as finished goods. Both are required; scrap defaults to 0."
          >
            {snapshot ? (
              <div className="mb-3 rounded-md border border-border/60 bg-bg-subtle/40 p-3 text-xs">
                <div>
                  <span className="text-fg-subtle">Producing:</span>{" "}
                  <span className="text-fg font-medium">
                    {snapshot.item_name}
                  </span>{" "}
                  <span className="text-fg-muted">({snapshot.item_id})</span>
                  <span className="ml-2 rounded-sm border border-info/40 bg-info-soft px-1.5 py-0.5 text-3xs text-info-fg">
                    {snapshot.supply_method}
                  </span>
                </div>
                <div className="mt-1">
                  <span className="text-fg-subtle">Pinned BOM:</span>{" "}
                  <span className="font-mono text-fg">
                    {snapshot.bom_version_label}
                  </span>{" "}
                  <span className="text-fg-subtle">· version_id</span>{" "}
                  <span className="font-mono text-fg-muted">
                    {snapshot.bom_version_id_pinned.slice(0, 8)}…
                  </span>
                </div>
                <div className="mt-1">
                  <span className="text-fg-subtle">BOM produces</span>{" "}
                  <span className="font-mono text-fg">
                    {snapshot.bom_final_output_qty} {snapshot.bom_final_output_uom}
                  </span>{" "}
                  <span className="text-fg-subtle">per batch</span>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Event time *
                </span>
                <input
                  type="datetime-local"
                  className="input"
                  value={eventAt}
                  onChange={(e) => setEventAt(e.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Output UoM *
                </span>
                <input
                  className="input"
                  value={outputUom}
                  onChange={(e) => setOutputUom(e.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Output quantity *
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  className="input"
                  value={outputQty}
                  onChange={(e) => setOutputQty(e.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Scrap quantity
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  className="input"
                  value={scrapQty}
                  onChange={(e) => setScrapQty(e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Notes
                </span>
                <textarea
                  className="input min-h-[3rem]"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes (shift, operator comments, etc.)."
                />
              </label>
            </div>
          </SectionCard>

          <SectionCard
            title="Expected consumption preview"
            description="Informational preview computed from BOM × (output + scrap). Server re-explodes authoritatively on submit."
          >
            <button
              type="button"
              className="btn btn-ghost btn-sm mb-3"
              onClick={() => setPreviewExpanded((v) => !v)}
            >
              {previewExpanded ? "Hide components" : "Show components"}{" "}
              ({snapshot?.bom_lines.length ?? 0})
            </button>
            {previewExpanded && snapshot ? (
              previewRows.length === 0 ? (
                <div className="text-xs text-fg-muted">
                  Enter an output or scrap quantity to see expected consumption.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border/70 bg-bg-subtle/60">
                        <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          Component
                        </th>
                        <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          Expected consumption
                        </th>
                        <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          UoM
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r) => (
                        <tr
                          key={r.component_id}
                          className="border-b border-border/40 last:border-b-0"
                        >
                          <td className="px-3 py-2">
                            <div className="text-fg-strong">
                              {r.component_name}
                            </div>
                            <div className="font-mono text-3xs text-fg-muted">
                              {r.component_id}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono text-fg">
                            {r.consumption_preview}
                          </td>
                          <td className="px-3 py-2 text-fg-muted">
                            {r.component_uom ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}
          </SectionCard>

          <div className="flex items-center justify-end gap-2">
            <button type="button" className="btn" onClick={resetFlow}>
              Cancel snapshot
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={phase === "submitting" || !canSubmit}
            >
              {phase === "submitting" ? "Submitting…" : "Submit production"}
            </button>
          </div>
        </form>
      ) : null}

      {/* ---------------------------------------------------------------------------
          Recent production runs — shows the last 10 submissions.
          Section is hidden entirely when there are no rows (endpoint not yet
          deployed, or no submissions recorded yet). Graceful degrade: if the
          backend endpoint is not yet live, historyQuery.isError is true and
          historyRows is empty, so the section stays hidden with no user-facing
          error noise.
          Output = good units produced; FG stock increases by output qty only.
          Scrap = consumed but not usable as finished goods (FG stock unchanged).
      --------------------------------------------------------------------------- */}
      {historyRows.length > 0 ? (
        <div className="mt-8">
          <SectionCard
            title="Recent production runs"
            description="Last 10 submitted production actuals. Output = good units produced (FG stock increases by output qty only). Scrap = consumed but not yielded as finished goods."
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/70 bg-bg-subtle/60">
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Item
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Output
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Scrap
                    </th>
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      UoM
                    </th>
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      BOM version
                    </th>
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Event time
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Consumed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((r) => (
                    <tr
                      key={r.submission_id}
                      className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-fg">
                          {r.item_name}
                        </div>
                        <div className="font-mono text-3xs text-fg-muted">
                          {r.item_id}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-fg">
                        {r.output_qty}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-fg-muted">
                        {r.scrap_qty}
                      </td>
                      <td className="px-3 py-2 text-fg-muted">
                        {r.output_uom}
                      </td>
                      <td className="px-3 py-2 font-mono text-fg-muted">
                        {r.bom_version_label}
                      </td>
                      <td className="px-3 py-2 text-fg-muted">
                        {fmtDate(r.event_at)}
                      </td>
                      <td className="px-3 py-2 text-right text-fg-muted">
                        {r.consumption_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      ) : null}
    </>
  );
}
