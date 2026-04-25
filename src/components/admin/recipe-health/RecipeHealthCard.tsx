// Recipe-Health card — top of /admin/masters/items/[item_id] for
// MANUFACTURED items. Composes the pure readiness layer with two
// TanStack Query data hooks. Read-only display; the Edit-recipe buttons
// run the clone-or-resume flow before navigating to the editor route.

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, Pencil } from "lucide-react";
import {
  computeLinePipState,
  computeRecipeHealthState,
  computeTrackHealth,
} from "@/lib/admin/recipe-readiness";
import type {
  ComponentReadiness,
  LinePipState,
} from "@/lib/admin/recipe-readiness.types";
import { RecipeTrackSummary } from "./RecipeTrackSummary";
import { useComponentReadinessMap } from "./useComponentReadinessMap";
import { useTrackData, type BomLineRow } from "./useTrackData";
import { useEnterEditDraft } from "@/components/bom-edit/useEnterEditDraft";

interface RecipeHealthCardProps {
  itemName: string;
  baseBomHeadId: string | null;
  packBomHeadId: string | null;
  isAdmin: boolean;
  /** Injectable navigator for tests. Defaults to next/navigation router.push. */
  onNavigate?: (href: string) => void;
}

const TOP_TONE: Record<
  "green" | "yellow" | "red",
  { surface: string; label: string; chip: string }
> = {
  green: {
    surface: "border-success-border bg-success-soft",
    label: "text-success-fg",
    chip: "bg-success text-success-soft",
  },
  yellow: {
    surface: "border-warning-border bg-warning-soft",
    label: "text-warning-fg",
    chip: "bg-warning text-warning-soft",
  },
  red: {
    surface: "border-danger-border bg-danger-soft",
    label: "text-danger-fg",
    chip: "bg-danger text-danger-soft",
  },
};

function pipsForLines(
  lines: BomLineRow[],
  readinessMap: Map<string, ComponentReadiness>,
  nowMs: number,
): LinePipState[] {
  return lines.map((line) => {
    const comp = readinessMap.get(line.final_component_id);
    if (!comp) {
      return {
        color: "yellow",
        reasons: ["Loading…"],
        warningCategories: ["missing-supplier"],
        blockerCategories: [],
        isHardBlock: false,
      };
    }
    return computeLinePipState({
      qty: line.final_component_qty,
      component: comp,
      nowMs,
    });
  });
}

interface ConfirmTrack {
  bomHeadId: string;
  activeVersionId: string | null;
  existingDraftId: string | null;
  reason: "draft-exists" | "no-active";
}

export function RecipeHealthCard({
  itemName,
  baseBomHeadId,
  packBomHeadId,
  isAdmin,
  onNavigate,
}: RecipeHealthCardProps): JSX.Element {
  const router = useRouter();
  const navigate = onNavigate ?? ((href: string) => router.push(href));
  const enter = useEnterEditDraft();
  const [confirmTrack, setConfirmTrack] = useState<ConfirmTrack | null>(null);

  const baseTrack = useTrackData(baseBomHeadId);
  const packTrack = useTrackData(packBomHeadId);

  const componentIds = useMemo(() => {
    const ids = new Set<string>();
    baseTrack.lines.forEach((l) => ids.add(l.final_component_id));
    packTrack.lines.forEach((l) => ids.add(l.final_component_id));
    return Array.from(ids);
  }, [baseTrack.lines, packTrack.lines]);

  const readiness = useComponentReadinessMap(componentIds);

  if (baseTrack.isError || packTrack.isError || readiness.isError) {
    return (
      <section className="rounded-md border border-danger-border bg-danger-soft p-5">
        <p className="text-sm font-semibold text-danger-fg">
          Could not load production recipe
        </p>
        <p className="mt-1 text-xs text-danger-fg/90">
          {baseTrack.errorMessage ||
            packTrack.errorMessage ||
            readiness.errorMessage ||
            "Unknown error"}
        </p>
      </section>
    );
  }

  if (!baseTrack.isReady || !packTrack.isReady || !readiness.isReady) {
    return (
      <section className="rounded-md border border-border bg-bg-raised p-5 text-sm text-fg-muted">
        Loading production recipe…
      </section>
    );
  }

  const nowMs = Date.now();
  const baseHealth = computeTrackHealth({
    hasActiveVersion: baseTrack.activeVersionId !== null,
    pips: pipsForLines(baseTrack.lines, readiness.map, nowMs),
    trackLabel: "Base formula",
  });
  const packHealth = computeTrackHealth({
    hasActiveVersion: packTrack.activeVersionId !== null,
    pips: pipsForLines(packTrack.lines, readiness.map, nowMs),
    trackLabel: "Pack BOM",
  });
  const top = computeRecipeHealthState({ base: baseHealth, pack: packHealth });
  const tone = TOP_TONE[top.color];

  async function handleEdit(
    bomHeadId: string,
    activeVersionId: string | null,
    draftId: string | null,
  ) {
    if (draftId) {
      setConfirmTrack({
        bomHeadId,
        activeVersionId,
        existingDraftId: draftId,
        reason: "draft-exists",
      });
      return;
    }
    if (activeVersionId === null) {
      setConfirmTrack({
        bomHeadId,
        activeVersionId: null,
        existingDraftId: null,
        reason: "no-active",
      });
      return;
    }
    const targetId = await enter.enterEdit({
      bomHeadId,
      activeVersionId,
      existingDraftId: null,
    });
    navigate(`/admin/masters/boms/${bomHeadId}/${targetId}/edit`);
  }

  function EditButton({
    bomHeadId,
    activeVersionId,
    draftId,
  }: {
    bomHeadId: string;
    activeVersionId: string | null;
    draftId: string | null;
  }) {
    return (
      <button
        type="button"
        onClick={() => handleEdit(bomHeadId, activeVersionId, draftId)}
        disabled={enter.isPending}
        className="mt-3 inline-flex items-center gap-1.5 rounded-sm border border-border bg-bg-raised px-3 py-1.5 text-xs font-medium text-fg shadow-sm transition-colors hover:border-accent hover:bg-accent-softer hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Pencil className="h-3 w-3" strokeWidth={2} />
        {draftId ? "Resume draft" : "Edit recipe"}
        <ArrowRight className="h-3 w-3" strokeWidth={2} />
      </button>
    );
  }

  return (
    <section className="rounded-md border border-border bg-bg-raised p-5 shadow-sm">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Production recipe
          </p>
          <h2 className="text-base font-semibold text-fg-strong">{itemName}</h2>
        </div>
        <span
          className={`rounded-sm px-2 py-1 text-xs font-medium ${tone.chip}`}
        >
          {top.label}
        </span>
      </header>

      <div
        data-tracks-grid
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <div>
          <RecipeTrackSummary
            trackLabel="Base formula"
            activeVersionLabel={baseTrack.activeVersionLabel}
            health={baseHealth}
          />
          {isAdmin && baseBomHeadId && (
            <EditButton
              bomHeadId={baseBomHeadId}
              activeVersionId={baseTrack.activeVersionId}
              draftId={baseTrack.draftVersionId}
            />
          )}
        </div>
        <div>
          <RecipeTrackSummary
            trackLabel="Pack BOM"
            activeVersionLabel={packTrack.activeVersionLabel}
            health={packHealth}
          />
          {isAdmin && packBomHeadId && (
            <EditButton
              bomHeadId={packBomHeadId}
              activeVersionId={packTrack.activeVersionId}
              draftId={packTrack.draftVersionId}
            />
          )}
        </div>
      </div>

      <div
        className={`mt-5 rounded-sm border ${tone.surface} px-4 py-3`}
      >
        <p className={`text-sm font-semibold ${tone.label}`}>{top.label}</p>
        {(top.blockers.length > 0 || top.warnings.length > 0) && (
          <ul className="mt-2 space-y-1 text-xs">
            {top.blockers.map((b) => (
              <li
                key={`b-${b}`}
                className="flex items-start gap-1.5 text-danger-fg"
              >
                <span
                  aria-hidden
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger"
                />
                <span>{b}</span>
              </li>
            ))}
            {top.warnings.map((w) => (
              <li
                key={`w-${w}`}
                className="flex items-start gap-1.5 text-warning-fg"
              >
                <span
                  aria-hidden
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
                />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmTrack && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm recipe edit"
          className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4"
        >
          <div className="max-w-md rounded-md border border-border bg-bg-raised p-5 shadow-lg">
            <p className="text-sm text-fg">
              {confirmTrack.reason === "draft-exists"
                ? "A draft already exists for this track. Continue editing it?"
                : "This track has no active recipe yet. Create the first version?"}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-sm border border-border bg-bg-raised px-3 py-1.5 text-sm text-fg hover:bg-bg-subtle"
                onClick={() => setConfirmTrack(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-sm border border-accent-border bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover"
                onClick={async () => {
                  const ct = confirmTrack;
                  setConfirmTrack(null);
                  const targetId = await enter.enterEdit({
                    bomHeadId: ct.bomHeadId,
                    activeVersionId: ct.activeVersionId,
                    existingDraftId: ct.existingDraftId,
                  });
                  navigate(
                    `/admin/masters/boms/${ct.bomHeadId}/${targetId}/edit`,
                  );
                }}
              >
                {confirmTrack.reason === "draft-exists"
                  ? "Open draft"
                  : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
