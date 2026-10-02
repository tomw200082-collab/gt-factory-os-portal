"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { REPORT_UI as L } from "../../_lib/labels";
import { toCsv } from "../../_lib/report/csv";

/**
 * Copy the table on screen as CSV: an icon button beside the search, with one stable name. What happened
 * (copied, or the browser refused) goes to a separate live region that is always mounted, and shows as a
 * check mark on the button for a moment.
 */
export function CopyCsv({ rows }: { rows: () => string[][] }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (next: "done" | "failed") => {
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  };

  const copy = async () => {
    const csv = toCsv(rows());
    try {
      await navigator.clipboard.writeText(csv);
      flash("done");
    } catch {
      // an older browser or an insecure origin: the textarea route still works
      try {
        const ta = document.createElement("textarea");
        ta.value = csv;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        flash(ok ? "done" : "failed");
      } catch {
        flash("failed");
      }
    }
  };

  return (
    <>
      <button
        type="button"
        className="s-rp-tool s-rp-icon"
        aria-label={L.copyCsv}
        title={state === "failed" ? L.copyFailed : L.copyCsv}
        data-testid="report-csv"
        data-state={state}
        onClick={() => void copy()}
      >
        {state === "done" ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
      </button>
      <span className="sr-only" role="status" data-testid="report-csv-status">
        {state === "done" ? L.copied : state === "failed" ? L.copyFailed : ""}
      </span>
    </>
  );
}
