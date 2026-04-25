"use client";

// ---------------------------------------------------------------------------
// /planner/forecast/new — open a cold-start draft (G.4).
//
// Scope (W2 Mode B, Forecast MVP):
//   - Single-screen form: site_id (fixed GT-MAIN in v1), cadence (monthly
//     in v1; enum sent per schema), horizon_start_at (YYYY-MM-DD), horizon_weeks
//     (8 in v1), optional notes.
//   - Client-generated idempotency_key.
//   - On 201 -> redirect to /forecast/[version_id].
//   - Blocks non-planner/admin at the UI level (defence in depth; server also
//     enforces per §A.3).
// ---------------------------------------------------------------------------

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { NotesBox } from "@/components/fields/NotesBox";
import { useSession } from "@/lib/auth/session-provider";
import type { Session } from "@/lib/auth/fake-auth";

interface OpenDraftRequest {
  idempotency_key: string;
  cadence: "monthly" | "weekly" | "daily";
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

function horizonPreview(horizonStart: string, horizonWeeks: number): string {
  if (!horizonStart) return "";
  try {
    const start = new Date(horizonStart + "T00:00:00Z");
    const endMs = start.getTime() + horizonWeeks * 7 * 24 * 60 * 60 * 1000;
    const end = new Date(endMs);
    const months: string[] = [];
    let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (d.getTime() < endMs && months.length < 24) {
      months.push(d.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" }));
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    }
    void end;
    return months.join(" · ");
  } catch {
    return "";
  }
}

function sessionHeaders(_session: Session): HeadersInit {
  return {
    "Content-Type": "application/json",
  };
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
    throw new Error(reason || "Could not open draft. Check your connection and try again.");
  }
  return (await res.json()) as OpenDraftResponse;
}

export default function NewForecastDraftPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const canAuthor = session.role === "planner" || session.role === "admin";

  const [horizonStart, setHorizonStart] = useState<string>(todayIsoDate());
  const [notes, setNotes] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const preview = useMemo(() => horizonPreview(horizonStart, 8), [horizonStart]);

  const openMut = useMutation({
    mutationFn: (body: OpenDraftRequest) => postOpenDraft(session, body),
    onSuccess: (resp) => {
      // Invalidate the parent forecast-versions list so returning to
      // /planning/forecast immediately shows the new draft instead of
      // a stale cached page.
      void queryClient.invalidateQueries({
        queryKey: ["forecasts", "versions"],
      });
      router.push(`/planning/forecast/${encodeURIComponent(resp.version.version_id)}`);
    },
    onError: (err: unknown) => {
      console.error("[ForecastNew] open-draft error:", err);
      setErrorMessage("Could not open draft. Check your connection or try again. If the problem persists, contact your admin.");
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

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    openMut.mutate({
      idempotency_key: newIdempotencyKey(),
      cadence: "monthly",
      horizon_start_at: horizonStart,
      notes: notes.trim().length > 0 ? notes.trim() : null,
    });
  };

  return (
    <>
      <WorkflowHeader
        eyebrow="Planner workspace"
        title="New forecast draft"
        description="Open a draft for the 8-week horizon. You'll add lines and publish on the next screen."
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
                htmlFor="forecast-new-cadence"
                className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
              >
                Cadence
              </label>
              <input
                id="forecast-new-cadence"
                type="text"
                value="Monthly"
                disabled
                readOnly
                className="input h-9 w-full"
                data-testid="forecast-new-cadence"
              />
            </div>
            <div>
              <label
                htmlFor="forecast-new-horizon-start"
                className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
              >
                Horizon start date
              </label>
              <input
                id="forecast-new-horizon-start"
                type="date"
                value={horizonStart}
                onChange={(e) => setHorizonStart(e.target.value)}
                className="input h-9 w-full"
                data-testid="forecast-new-horizon-start"
                required
              />
              {preview ? (
                <p className="mt-1 text-3xs text-fg-subtle">
                  Covers: {preview}
                </p>
              ) : null}
            </div>
            <div>
              <label
                htmlFor="forecast-new-horizon-weeks"
                className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
              >
                Horizon weeks
              </label>
              <input
                id="forecast-new-horizon-weeks"
                type="text"
                value="8"
                disabled
                readOnly
                className="input h-9 w-full"
                data-testid="forecast-new-horizon-weeks"
              />
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
