"use client";

// Printable order sheet for a single purchase-session PO draft.
//
// A precise, detailed, supplier-facing Hebrew order — the printable form of
// the order message. Renders item lines (with supplier wording + spec) and
// labels grouped by physical size (per-size total for pricing, then a
// per-design breakdown with print-file / photo references). "הדפס / שמור
// כ-PDF" uses the browser print dialog → clean RTL Hebrew PDF (no server
// rendering). Data comes from the current session (no new API call).

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { useCurrentSession } from "../../../purchase-session/_lib/api";
import {
  buildOrderSheetModel,
  type SheetLine,
} from "../../_lib/order-sheet";

function AssetChips({ line }: { line: SheetLine }) {
  if (!line.printFile && !line.photo) return null;
  return (
    <span className="ms-2 inline-flex flex-wrap gap-1 align-middle">
      {line.printFile && (
        <span className="rounded border border-border/60 bg-bg-subtle px-1.5 py-0.5 text-3xs text-fg-muted">
          קובץ דפוס: <bdi>{line.printFile}</bdi>
        </span>
      )}
      {line.photo && (
        <span className="rounded border border-border/60 bg-bg-subtle px-1.5 py-0.5 text-3xs text-fg-muted">
          תמונה: <bdi>{line.photo}</bdi>
        </span>
      )}
    </span>
  );
}

export default function OrderSheetPage() {
  const params = useParams<{ session_po_id: string }>();
  const sessionPoId = params.session_po_id;
  const { data, isLoading, isError, refetch } = useCurrentSession();

  const po = useMemo(
    () => data?.session?.pos.find((p) => p.session_po_id === sessionPoId) ?? null,
    [data, sessionPoId],
  );
  const model = useMemo(() => (po ? buildOrderSheetModel(po) : null), [po]);

  return (
    <div className="mx-auto max-w-3xl p-4">
      {/* Toolbar — hidden when printing */}
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <Link
          href="/planning/procurement"
          className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
        >
          {/* R2-F07: this toolbar sits outside the RTL body and inherits the
              app shell's LTR flow — ArrowRight visually points forward, not
              back, in that context. */}
          <ArrowLeft className="h-4 w-4" aria-hidden /> חזרה לרכש
        </Link>
        {model && (
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded border border-border/80 bg-bg-raised px-3 py-1.5 text-sm font-semibold text-fg hover:bg-bg-subtle"
            data-testid="order-sheet-print"
          >
            <Printer className="h-4 w-4" aria-hidden /> הדפס / שמור כ-PDF
          </button>
        )}
      </div>

      {/* ux-release-gate 2026-07-23 FLOW-001/COPY-008/A11Y-022: structured
          loading/error/not-found states — the toolbar back-link above is
          always present, but each state now also carries its own recovery
          path and no raw API error message ever reaches this Hebrew surface. */}
      {isLoading && (
        <div className="no-print space-y-2" aria-busy="true" aria-live="polite">
          <div className="h-6 w-2/3 animate-pulse rounded bg-bg-subtle" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-bg-subtle" />
          <div className="h-32 w-full animate-pulse rounded-xl bg-bg-subtle" />
        </div>
      )}
      {isError && (
        <div
          role="alert"
          className="no-print rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg"
        >
          <div className="font-medium">שגיאה בטעינת גיליון ההזמנה</div>
          {/* COPY-044: was static "try again" instruction text with nothing
              to actually click — added a real retry action. */}
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 text-xs font-medium underline hover:no-underline"
          >
            נסה שוב
          </button>
        </div>
      )}
      {!isLoading && !isError && !po && (
        <div
          className="no-print rounded-md border border-warning/40 bg-warning-softer px-4 py-3 text-sm text-warning-fg"
          data-testid="order-sheet-not-found"
        >
          <div className="font-medium">לא נמצאה הזמנה פתוחה עבור מזהה זה</div>
          <div className="mt-1 text-xs opacity-90">
            ייתכן שהמושב נסגר או שההזמנה הוסרה.
          </div>
          <Link
            href="/planning/procurement"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 hover:no-underline"
          >
            {/* R2-F07: same LTR-context fix as the toolbar back-link above. */}
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> חזרה לרכש
          </Link>
        </div>
      )}

      {model && (
        <article
          dir="rtl"
          className="order-sheet rounded-xl border border-border bg-bg p-6 text-fg"
        >
          <header className="mb-4 border-b border-border pb-3">
            <h1 className="text-lg font-bold">הזמנת רכש — GT Everyday</h1>
            <p className="mt-1 text-sm text-fg-muted">
              לכבוד: <bdi className="font-semibold text-fg">{model.supplier}</bdi>
            </p>
          </header>

          <p className="mb-4 text-sm">
            נשמח להזמין מכם את הפריטים הבאים עבור מפעל GT Everyday:
          </p>

          {model.hasItems && (
            <section className="mb-5">
              <ol className="space-y-1.5 text-sm">
                {model.items.map((it, i) => (
                  <li key={it.key}>
                    <span className="font-medium">
                      {i + 1}. <bdi>{it.name}</bdi> — {it.qty} {it.uom}
                    </span>
                    <AssetChips line={it} />
                    {it.specHint && (
                      <div className="text-3xs text-fg-subtle">({it.specHint})</div>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {model.hasLabels && (
            <section className="mb-5">
              <h2 className="mb-1 text-sm font-bold">
                מדבקות — סיכום לפי גודל (לתמחור)
              </h2>
              <ul className="mb-3 space-y-0.5 text-sm">
                {model.labelGroups.map((g) => (
                  <li key={g.sizeId}>
                    • <bdi>{g.sizeLabel}</bdi> — סה&quot;כ <strong>{g.total}</strong> {g.uom}
                  </li>
                ))}
              </ul>

              <h2 className="mb-1 text-sm font-bold">פירוט מלא לפי סוג</h2>
              <div className="space-y-3">
                {model.labelGroups.map((g) => (
                  <div key={g.sizeId} className="rounded-lg bg-bg-subtle p-2.5">
                    <div className="mb-1 text-sm font-semibold">
                      <bdi>{g.sizeLabel}</bdi> — {g.total} {g.uom}
                    </div>
                    <ol className="space-y-1 text-sm">
                      {g.designs.map((d, i) => (
                        <li key={d.key}>
                          <span>
                            {i + 1}. <bdi>{d.name}</bdi> — {d.qty} {d.uom}
                          </span>
                          <AssetChips line={d} />
                          {d.specHint && (
                            <div className="text-3xs text-fg-subtle">({d.specHint})</div>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>

              <p className="mt-2 text-3xs text-fg-subtle">
                {model.missingPrintFiles === 0
                  ? "קבצי הדפוס המוכנים להדפסה מצורפים ליד כל סוג."
                  : "קבצי הדפוס מצורפים ליד הסוגים המסומנים; לסוגים ללא סימון הקובץ יושלם בנפרד."}
              </p>
            </section>
          )}

          <footer className="mt-5 border-t border-border pt-3 text-sm">
            <p>{model.needDateText}</p>
            <p className="font-semibold">{model.totalText}</p>
            <p className="mt-3">תודה רבה,</p>
            <p>GT Everyday</p>
          </footer>
        </article>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .order-sheet { border: none !important; padding: 0 !important; }
          @page { margin: 16mm; }
        }
      `}</style>
    </div>
  );
}
