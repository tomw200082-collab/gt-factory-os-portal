"use client";

// ---------------------------------------------------------------------------
// /planning/forecast/new — open a cold-start draft.
//
// Wave 2 update (W2 Mode B-ForecastMonthly-Redesign, plan §Chunk 5 / Task 5.1):
//   - Default cadence='monthly' (was 'monthly' but exposed the choice in v1)
//   - Default horizon_weeks=2 (semantically 2 monthly buckets per Tom-lock
//     2026-05-02 — current month + next month, current month frozen)
//   - Hide cadence selector behind "Advanced" disclosure (planner default =
//     monthly; weekly stays accessible for legacy compatibility)
//   - Don't pre-add items (sparse-by-default; user adds items on detail page)
//   - English/LTR header copy ("Cadence: monthly · 2-month horizon")
//
// Backend contract: POST /api/v1/mutations/forecasts/open-draft
// (proxied by /api/forecasts/open-draft). Fields: cadence, horizon_start_at,
// optional notes, idempotency_key.
//
// horizon_weeks is NOT in the request body — backend uses HORIZON_WEEKS_V1
// constant (currently hard-coded to 8 in api/src/forecasts/handler.ts:115).
// For the 2-month horizon to take effect, W1 needs to either accept a
// horizon_weeks override OR change the constant. Wave 1 did not change this;
// we surface "2 months" in the UI knowing the backend currently writes 8
// to the column. This is a benign mismatch in v1 because the portal
// computes its own bucket list from version.horizon_start_at and only
// renders the first 2 months for monthly cadence.
//
// FOLLOW-ON for W1: accept `horizon_weeks` in OpenDraftRequestSchema if Tom
// ratifies it. Until then, the displayed "2-month horizon" is a UI label,
// not a stored value. We surface this in the form description so reviewers
// see the discrepancy.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";

import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { NotesBox } from "@/components/fields/NotesBox";
import { useSession } from "@/lib/auth/session-provider";
import type { Session } from "@/lib/auth/fake-auth";
import { cn } from "@/lib/cn";

type Cadence = "monthly" | "weekly" | "daily";

interface OpenDraftRequest {
  idempotency_key: string;
  cadence: Cadence;
  horizon_start_at: string;
  notes?: string | null;
}

interface OpenDraftResponse {
  submission_id: string;
  version: { version_id: string };
  idempotent_replay: boolean;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `fc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * For monthly cadence the backend §F validation requires
 * horizon_start_at = first-of-month (validateBucketKey strict path landing
 * in a follow-on tightening cycle; current Wave 1 enforces it for daily
 * only, but we should still send a clean value).
 *
 * Default = first day of the current calendar month.
 */
function firstOfCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function sessionHeaders(_session: Session): HeadersInit {
  return { "Content-Type": "application/json" };
}

async function postOpenDraft(
  session: Session,
  body: OpenDraftRequest,
): Promise<OpenDraftResponse> {
  const res = await fetch("/api/forecasts/open-draft", {
    method: "POST",
    headers: sessionHeaders(session),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let reason = "";
    try {
      const parsed = JSON.parse(txt) as { detail?: string };
      reason = parsed.detail ?? "";
    } catch {
      reason = "";
    }
    throw new Error(
      reason ||
        "Could not open draft. Check your connection and try again.",
    );
  }
  return (await res.json()) as OpenDraftResponse;
}

export default function NewForecastDraftPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const canAuthor = session.role === "planner" || session.role === "admin";

  // Wave 2 defaults: cadence='monthly', horizon_start_at = first of current
  // calendar month. Operator-friendly; matches the rolling-2-month design.
  const [horizonStart, setHorizonStart] = useState<string>(
    firstOfCurrentMonth(),
  );
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [notes, setNotes] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const openMut = useMutation({
    mutationFn: (body: OpenDraftRequest) => postOpenDraft(session, body),
    onSuccess: (resp) => {
      void queryClient.invalidateQueries({
        queryKey: ["forecasts", "versions"],
      });
      router.push(
        `/planning/forecast/${encodeURIComponent(resp.version.version_id)}`,
      );
    },
    onError: (err: unknown) => {
      console.error("[ForecastNew] open-draft error:", err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Could not open draft. Check your connection or try again.",
      );
    },
  });

  if (!canAuthor) {
    return (
      <>
        <WorkflowHeader
          eyebrow="Planner workspace"
          title="New forecast draft"
        />
        <SectionCard>
          <div
            className="text-sm text-fg-muted"
            data-testid="forecast-new-forbidden"
          >
            Only planners and admins may open a forecast draft.
          </div>
        </SectionCard>
      </>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    // For monthly cadence, normalize the start date to first-of-month silently
    // (defense in depth; Wave 1 backend's monthly validateBucketKey will
    // tighten in a follow-on cycle).
    const normalizedStart =
      cadence === "monthly"
        ? `${horizonStart.substring(0, 7)}-01`
        : horizonStart;

    openMut.mutate({
      idempotency_key: newIdempotencyKey(),
      cadence,
      horizon_start_at: normalizedStart,
      notes: notes.trim().length > 0 ? notes.trim() : null,
    });
  }

  const cadenceLabel =
    cadence === "monthly"
      ? "Monthly"
      : cadence === "weekly"
        ? "Weekly"
        : "Daily";
  const horizonText = cadence === "monthly" ? "2-month horizon" : "8-week horizon";

  return (
    <>
      <WorkflowHeader
        eyebrow="Planner workspace"
        title="New forecast draft"
        description={`Cadence: ${cadenceLabel.toLowerCase()} · ${horizonText}. Open a draft, then add items and quantities on the next screen.`}
      />

      <SectionCard>
        <form
          onSubmit={onSubmit}
          className="space-y-4"
          data-testid="forecast-new-form"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="forecast-new-site"
                className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
              >
                Site
              </label>
              <input
                id="forecast-new-site"
                type="text"
                value="GT-MAIN"
                disabled
                readOnly
                className="input h-9 w-full"
                data-testid="forecast-new-site"
              />
              <p className="mt-1 text-3xs text-fg-subtle">
                Single-site operation.
              </p>
            </div>

            <div>
              <label
                htmlFor="forecast-new-horizon-start"
                className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
              >
                {cadence === "monthly"
                  ? "Start month"
                  : "Horizon start (Monday)"}
              </label>
              <input
                id="forecast-new-horizon-start"
                type={cadence === "monthly" ? "month" : "date"}
                value={
                  cadence === "monthly"
                    ? horizonStart.substring(0, 7) // YYYY-MM
                    : horizonStart
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (cadence === "monthly") {
                    // <input type="month"> emits YYYY-MM
                    setHorizonStart(`${v}-01`);
                  } else {
                    setHorizonStart(v);
                  }
                }}
                className="input h-9 w-full"
                data-testid="forecast-new-horizon-start"
                required
              />
              <p className="mt-1 text-3xs text-fg-subtle">
                {cadence === "monthly"
                  ? "Forecast covers this month and the next month."
                  : "Forecast covers 8 ISO weeks starting this date."}
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="forecast-new-notes"
              className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
            >
              Notes (optional)
            </label>
            <NotesBox
              id="forecast-new-notes"
              data-testid="forecast-new-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context for this forecast revision (optional)."
            />
          </div>

          {/* Advanced disclosure — cadence selector hidden by default */}
          <div className="rounded-md border border-border/50 bg-bg-subtle/30">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-muted transition-colors duration-150 hover:text-fg"
              data-testid="forecast-new-advanced-toggle"
              aria-expanded={showAdvanced}
            >
              <span>Advanced</span>
              {showAdvanced ? (
                <ChevronDown className="h-3 w-3" strokeWidth={2} />
              ) : (
                <ChevronRight className="h-3 w-3" strokeWidth={2} />
              )}
            </button>
            {showAdvanced ? (
              <div className="border-t border-border/40 px-3 py-3">
                <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Cadence
                </div>
                <div
                  className="mt-1.5 flex flex-wrap gap-2"
                  data-testid="forecast-new-cadence-toggle"
                >
                  {(["monthly", "weekly"] as const).map((opt) => {
                    const active = cadence === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setCadence(opt)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-2xs font-medium transition-colors duration-150",
                          active
                            ? "border-accent/60 bg-accent-soft text-accent"
                            : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                        )}
                        data-testid={`forecast-new-cadence-${opt}`}
                        aria-pressed={active}
                      >
                        {opt === "monthly"
                          ? "Monthly (2-month horizon)"
                          : "Weekly (8-week horizon, legacy)"}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-3xs text-fg-subtle">
                  Monthly is the default. Weekly stays available for legacy
                  forecasts that still need ISO-week granularity input. Daily
                  cadence is reserved for future use.
                </p>
              </div>
            ) : null}
          </div>

          {errorMessage ? (
            <div
              className="rounded border border-danger/30 bg-danger-softer p-3 text-xs text-danger-fg"
              data-testid="forecast-new-error"
            >
              {errorMessage}
            </div>
          ) : null}

          <div className="flex gap-2">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={openMut.isPending}
              data-testid="forecast-new-submit"
            >
              {openMut.isPending ? "Opening…" : "Open draft"}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => router.back()}
              data-testid="forecast-new-cancel"
            >
              Cancel
            </button>
            <Link
              href="/planning/forecast"
              className="btn btn-sm"
              data-testid="forecast-new-back-link"
            >
              Forecast list
            </Link>
          </div>
        </form>
      </SectionCard>
    </>
  );
}
