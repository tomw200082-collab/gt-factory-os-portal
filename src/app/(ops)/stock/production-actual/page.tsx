"use client";

// Deep-link integration with planning recommendations:
// /ops/stock/production-actual?item_id=<id>&suggested_qty=<n>&from_rec=<rec_id>&from_run=<run_id>
// — item_id pre-selects the producible item dropdown
// — suggested_qty pre-fills the output_qty field (operator can override)
// — from_rec / from_run surface a small "this run is authorized by..." breadcrumb
//   so the operator sees the chain back to the planning run that triggered it.
// All four params are optional and graceful: form works identically without them.

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

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  sku: string | null;
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

function supplyMethodHebrew(sm: string | null | undefined): string {
  if (sm === "MANUFACTURED") return "פריט ייצור";
  if (sm === "REPACK") return "פריט אריזה מחדש";
  if (sm === "BOUGHT_FINISHED") return "פריט מוגמר לרכישה";
  return "פריט לא מזוהה";
}

const REASON_CODE_HEBREW: Record<string, string> = {
  STALE_BOM_VERSION: "ה-BOM של הפריט עודכן לאחר פתיחת הטופס. סגור ופתח מחדש כדי להצמיד את הגרסה החדשה.",
  WRONG_SUPPLY_METHOD: "הפריט אינו פריט ייצור או אריזה מחדש — לא ניתן לדווח עליו דרך טופס זה.",
  UOM_MISMATCH: "יחידת המידה שהוזנה אינה תואמת לפריט. בדוק את שדה יחידת המידה ונסה שוב.",
  IDEMPOTENCY_KEY_REUSED: "הדיווח הזה נשלח כבר. אם הדיווח לא נראה לך מחובר, פתח מחדש את הטופס.",
};
function reasonCodeMessageHebrew(reason: string): string {
  return REASON_CODE_HEBREW[reason] ?? `הדיווח נדחה. קוד שגיאה: ${reason}. פנה למנהל המערכת.`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
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

  // Query-string-driven deep-link prefill from planning recommendations.
  // Read once on mount and apply ONLY if the corresponding state field is
  // still empty (does not stomp manually-typed values on URL changes).
  const searchParams = useSearchParams();
  const initialItemId = searchParams?.get("item_id") ?? "";
  const initialSuggestedQty = searchParams?.get("suggested_qty") ?? "";
  const fromRecId = searchParams?.get("from_rec") ?? null;
  const fromRunId = searchParams?.get("from_run") ?? null;

  const [selectedItemId, setSelectedItemId] = useState<string>(initialItemId);
  const [phase, setPhase] = useState<Phase>("pick");
  const [snapshot, setSnapshot] = useState<ProductionActualOpenResponse | null>(
    null,
  );
  const [eventAt, setEventAt] = useState<string>(nowLocalDateTime());
  const [outputQty, setOutputQty] = useState<string>(initialSuggestedQty);
  const [scrapQty, setScrapQty] = useState<string>("0");

  // One-shot apply of URL-driven prefill. Once the items query lands AND
  // the URL carried an item_id, validate that the item is producible (the
  // form rejects BOUGHT_FINISHED upstream so we don't want a deep-link
  // landing in a state that will 409 on submit). If the URL item_id isn't
  // valid, surface a small inline notice and clear the prefilled state so
  // the operator picks manually.
  const prefillAppliedRef = useRef(false);
  const [prefillRejected, setPrefillRejected] = useState<string | null>(null);
  useEffect(() => {
    if (prefillAppliedRef.current) return;
    if (!initialItemId) {
      prefillAppliedRef.current = true;
      return;
    }
    if (itemsQuery.isLoading || itemsQuery.isError) return;
    const match = producibleItems.find((r) => r.item_id === initialItemId);
    if (!match) {
      // Item exists but isn't producible (BOUGHT_FINISHED), or doesn't
      // exist at all. Either way, clear the prefill and warn.
      const allItems = itemsQuery.data?.rows ?? [];
      const exists = allItems.find((r) => r.item_id === initialItemId);
      setPrefillRejected(
        exists
          ? `הפריט ${exists.item_name ?? initialItemId} (${supplyMethodHebrew(exists.supply_method)}) — לא ניתן לדווח עליו דרך טופס ייצור. בחר פריט ייצור או אריזה מחדש.`
          : `הפריט ${initialItemId} לא נמצא במערכת. בחר פריט מהרשימה.`,
      );
      setSelectedItemId("");
      setOutputQty("");
    }
    prefillAppliedRef.current = true;
  }, [initialItemId, itemsQuery.isLoading, itemsQuery.isError, itemsQuery.data, producibleItems]);

  const [outputUom, setOutputUom] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  // Default to expanded so the operator sees expected consumption inline
  // while entering output_qty / scrap_qty — no extra click required to
  // verify the BOM × qty math matches expectation. Per S4 research §C
  // ("Production confirmation: BOM version snapshot UX, computed
  //  consumption preview"), this is the canonical pattern.
  const [previewExpanded, setPreviewExpanded] = useState<boolean>(true);
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
        setPreviewExpanded(snap.bom_lines.length > 0);
        setPhase("entering");
      } else {
        const detail = session.role === "admin"
          ? (body ? JSON.stringify(body) : `HTTP ${res.status}`)
          : "פרטי שגיאה זמינים בלוג המערכת.";
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
        detail: session.role === "admin"
          ? (err instanceof Error ? err.message : String(err))
          : "פרטי שגיאה זמינים בלוג המערכת.",
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
        const scrapNote =
          Number(committed.scrap_qty) > 0
            ? ` · scrap ${committed.scrap_qty} ${committed.output_uom}`
            : "";
        setDone({
          kind: "success",
          message: committed.idempotent_replay
            ? "Production already recorded."
            : `Posted ${committed.output_qty} ${committed.output_uom} of ${snapshot.item_name}${scrapNote}. ${committed.consumption.length} component${committed.consumption.length !== 1 ? "s" : ""} consumed.`,
          detail: `ref: ${committed.submission_id}`,
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
        const adminDetail = session.role === "admin" ? detail : "פרטי שגיאה זמינים בלוג המערכת.";
        if (reason === "STALE_BOM_VERSION") {
          setDone({
            kind: "stale",
            message: reasonCodeMessageHebrew(reason),
            detail: adminDetail,
          });
          setPhase("entering");
          return;
        }
        if (reason === "WRONG_SUPPLY_METHOD") {
          setDone({
            kind: "error",
            message: reasonCodeMessageHebrew(reason),
            detail: adminDetail,
          });
          setPhase("pick");
          return;
        }
        setDone({
          kind: "error",
          message: reasonCodeMessageHebrew(reason),
          detail: adminDetail,
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
          detail: session.role === "admin"
            ? (body ? JSON.stringify(body) : "HTTP 503")
            : "פרטי שגיאה זמינים בלוג המערכת.",
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
          detail: session.role === "admin"
            ? (body ? JSON.stringify(body) : `HTTP ${res.status}`)
            : "פרטי שגיאה זמינים בלוג המערכת.",
        });
        setPhase("entering");
        return;
      }
      // Fallback
      const detail = session.role === "admin"
        ? (body ? JSON.stringify(body) : `HTTP ${res.status}`)
        : "פרטי שגיאה זמינים בלוג המערכת.";
      setDone({
        kind: "error",
        message: "Could not submit. Check your connection and try again.",
        detail,
      });
      setPhase("entering");
    } catch (err) {
      setDone({
        kind: "error",
        message: "Network error submitting production actual.",
        detail: session.role === "admin"
          ? (err instanceof Error ? err.message : String(err))
          : "פרטי שגיאה זמינים בלוג המערכת.",
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
        title="דיווח ייצור"
        description="דווח על כמות שיוצרה ופחת. צריכת רכיבים מחושבת אוטומטית לפי ה-BOM הפעיל."
      />

      {/* Production-recommendation breadcrumb — appears only when the form
          was opened via deep-link from a planning recommendation. Gives the
          operator visible chain back to the run + recommendation that
          authorized this batch, and a quick path back to the run if they
          need to change something. */}
      {(fromRecId || fromRunId) ? (
        <div
          className="mb-4 flex flex-wrap items-start gap-2 rounded-md border border-info/40 bg-info-softer px-4 py-3 text-sm text-info-fg"
          role="status"
          data-testid="production-actual-from-rec-banner"
        >
          <div className="flex-1 min-w-0">
            <div className="font-medium">
              דיווח ייצור מתוך המלצה
            </div>
            <div className="mt-1 text-xs opacity-90">
              הטופס נפתח מתוך המלצת ייצור. כמות מומלצת מולאה מראש; ניתן לערוך
              לפני שליחה.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fromRecId && fromRunId ? (
              <Link
                href={`/planning/runs/${encodeURIComponent(fromRunId)}/recommendations/${encodeURIComponent(fromRecId)}`}
                className="text-xs font-medium underline underline-offset-2 hover:no-underline"
                data-testid="production-actual-from-rec-link"
              >
                חזור להמלצה →
              </Link>
            ) : null}
            {fromRunId ? (
              <Link
                href={`/planning/runs/${encodeURIComponent(fromRunId)}`}
                className="text-xs font-medium underline underline-offset-2 hover:no-underline"
              >
                ריצת תכנון →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Item prefill rejection banner — shows when ?item_id= in URL pointed
          to a non-producible item (e.g. BOUGHT_FINISHED) or unknown id. */}
      {prefillRejected ? (
        <div
          className="mb-4 rounded-md border border-warning/40 bg-warning-softer px-4 py-3 text-sm text-warning-fg"
          role="alert"
          data-testid="production-actual-prefill-rejected"
        >
          {prefillRejected}
        </div>
      ) : null}

      {!canSubmit ? (
        <div
          className="mb-4 rounded-md border border-warning/40 bg-warning-softer px-4 py-3 text-sm text-warning-fg"
          role="status"
        >
          <div className="font-medium">תצוגה בלבד.</div>
          <div className="mt-1 text-xs opacity-80">
            {`התפקיד שלך הוא ${session.role}. רק מפעיל או אדמין יכול לדווח על ייצור.`}
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
                פתח טופס מחדש
              </button>
            </div>
          ) : null}
          {/* Loop 9 — close the production-planning loop. After a successful
              submission that originated from a planning rec, the manager
              usually wants to go fulfill the next rec from the same run.
              Surface "Back to planning run" inline in the success banner
              so it's a single click instead of a scroll-to-top + breadcrumb
              hunt. The breadcrumb stays in place at the top for general
              context. */}
          {done.kind === "success" && fromRunId ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Link
                href={`/planning/runs/${encodeURIComponent(fromRunId)}?tab=production`}
                className="btn btn-sm gap-1.5"
                data-testid="production-actual-success-back-to-run"
              >
                ← חזור להמלצות הייצור של הריצה
              </Link>
              <span className="text-xs opacity-80">
                להמשיך לדווח על המלצה נוספת מאותה ריצת תכנון
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <SectionCard title="טוען פריטים…">
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
            <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
            <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
          </div>
        </SectionCard>
      ) : loadErr ? (
        <SectionCard title="לא ניתן לטעון פריטים">
          <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
            <div className="font-semibold">לא ניתן לטעון פריטים</div>
            <div className="mt-1 text-xs">{(loadErr as Error).message}</div>
            <button
              type="button"
              onClick={() => void itemsQuery.refetch()}
              className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
            >
              נסה שוב
            </button>
          </div>
        </SectionCard>
      ) : phase === "pick" ? (
        <form onSubmit={handleOpen} className="space-y-5">
          <SectionCard
            title="שלב 1 — בחר את הפריט שיוצר"
            description="מוצגים רק פריטים בייצור או באריזה מחדש. אם ה-BOM משתנה אחרי פתיחת הטופס, יידרש פתיחה מחדש לפני שליחה."
          >
            <div className="grid grid-cols-1 gap-3">
              <label className="block min-w-0">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  פריט *
                </span>
                <select
                  className="input"
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  required
                >
                  <option value="">— בחר —</option>
                  <optgroup label="ייצור">
                    {producibleItems
                      .filter((r) => r.supply_method === "MANUFACTURED")
                      .map((r) => (
                        <option key={r.item_id} value={r.item_id}>
                          {r.item_name} · {r.sku ?? r.item_id}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="אריזה מחדש">
                    {producibleItems
                      .filter((r) => r.supply_method === "REPACK")
                      .map((r) => (
                        <option key={r.item_id} value={r.item_id}>
                          {r.item_name} · {r.sku ?? r.item_id}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </label>
              <div className="text-xs text-fg-muted">
                {`${producibleItems.length} פריטים ניתן לייצור · ${producibleItems.filter((r) => r.supply_method === "MANUFACTURED").length} בייצור · ${producibleItems.filter((r) => r.supply_method === "REPACK").length} באריזה מחדש`}
              </div>
            </div>
          </SectionCard>
          <div className="flex items-center justify-end gap-2">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!selectedItemId}
            >
              המשך להזנה
            </button>
          </div>
        </form>
      ) : phase === "entering" || phase === "submitting" || phase === "done" ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <SectionCard
            title="שלב 2 — הזן כמות שיוצרה"
            description="כמות הפלט = כמות סחורה תקינה שיוצרה. כמות פחת = חומר שנצרך אבל לא ניתן למכירה כמוצר מוגמר. שני השדות חובה. ברירת מחדל לפחת היא 0."
          >
            {snapshot ? (
              <div className="mb-3 rounded-md border border-border/60 bg-bg-subtle/40 p-3 text-xs">
                <div>
                  <span className="text-fg-subtle">מייצר:</span>{" "}
                  <span className="text-fg font-medium">
                    {snapshot.item_name}
                  </span>{" "}
                  <span className="text-fg-muted">({snapshot.item_id})</span>
                  <span className="ml-2 rounded-sm border border-info/40 bg-info-soft px-1.5 py-0.5 text-3xs text-info-fg">
                    {snapshot.supply_method === "MANUFACTURED" ? "ייצור" : snapshot.supply_method === "REPACK" ? "אריזה מחדש" : snapshot.supply_method}
                  </span>
                </div>
                <div className="mt-1">
                  <span className="text-fg-subtle">BOM מוצמד:</span>{" "}
                  <span className="font-mono text-fg">
                    {snapshot.bom_version_label}
                  </span>
                </div>
                <div className="mt-1">
                  <span className="text-fg-subtle">BOM מפיק</span>{" "}
                  <span className="font-mono text-fg">
                    {snapshot.bom_final_output_qty} {snapshot.bom_final_output_uom}
                  </span>{" "}
                  <span className="text-fg-subtle">לכל מנה</span>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block min-w-0">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  זמן אירוע *
                </span>
                <input
                  type="datetime-local"
                  className="input"
                  value={eventAt}
                  onChange={(e) => setEventAt(e.target.value)}
                  required
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  יחידת מידה *
                </span>
                <input
                  className="input"
                  value={outputUom}
                  onChange={(e) => setOutputUom(e.target.value)}
                  required
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  כמות פלט *
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
              <label className="block min-w-0">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  כמות פחת
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
              <label className="block min-w-0 sm:col-span-2">
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  הערות
                </span>
                <textarea
                  className="input min-h-[3rem]"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="הערות (משמרת, תגובות מפעיל וכו')."
                />
              </label>
            </div>
          </SectionCard>

          <SectionCard
            title="תצוגה מקדימה — צריכת רכיבים צפויה"
            description="הערכת צריכת רכיבים לפי BOM וכמויות שהוזנו. הערך הסופי מחושב בעת השליחה."
          >
            <button
              type="button"
              className="btn btn-ghost btn-sm mb-3"
              onClick={() => setPreviewExpanded((v) => !v)}
            >
              {previewExpanded ? "הסתר רכיבים" : "הצג רכיבים"}{" "}
              ({snapshot?.bom_lines.length ?? 0})
            </button>
            {previewExpanded && snapshot ? (
              previewRows.length === 0 ? (
                <div className="text-xs text-fg-muted">
                  הזן כמות פלט או פחת כדי לראות צריכת רכיבים צפויה.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border/70 bg-bg-subtle/60">
                        <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          רכיב
                        </th>
                        <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          צריכה צפויה
                        </th>
                        <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                          יחידה
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
              בטל ופתח מחדש
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={phase === "submitting" || !canSubmit}
            >
              {phase === "submitting" ? "שולח…" : "שלח דיווח ייצור"}
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
            title="דיווחי ייצור אחרונים"
            description="10 הדיווחים האחרונים. כמות פלט = סחורה תקינה (מלאי FG עולה לפי כמות פלט בלבד). כמות פחת = חומר שנצרך אך לא הופק כסחורה תקינה."
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/70 bg-bg-subtle/60">
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      פריט
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      פלט
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      פחת
                    </th>
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      גרסת BOM
                    </th>
                    <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      זמן אירוע
                    </th>
                    <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      נצרך
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
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-fg">
                        {r.output_qty} {r.output_uom}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-fg-muted">
                        {r.scrap_qty} {r.output_uom}
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
