// Recipe-Health card — top of /admin/masters/items/[item_id] for
// MANUFACTURED items. Composes the pure readiness layer with two TanStack
// Query data hooks. Read-only display; the Edit-recipe buttons run the
// clone-or-resume flow before navigating to the editor route.

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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

const TOP_COLOR_CLASS: Record<"green" | "yellow" | "red", string> = {
  green: "bg-green-100 text-green-900",
  yellow: "bg-yellow-100 text-yellow-900",
  red: "bg-red-100 text-red-900",
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
        reasons: ["טוען…"],
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

  if (!baseTrack.isReady || !packTrack.isReady || !readiness.isReady) {
    return <div className="rounded-md border p-4">טוען…</div>;
  }

  const nowMs = Date.now();
  const baseHealth = computeTrackHealth({
    hasActiveVersion: baseTrack.activeVersionId !== null,
    pips: pipsForLines(baseTrack.lines, readiness.map, nowMs),
    trackLabel: "בסיס המוצר",
  });
  const packHealth = computeTrackHealth({
    hasActiveVersion: packTrack.activeVersionId !== null,
    pips: pipsForLines(packTrack.lines, readiness.map, nowMs),
    trackLabel: "אריזת המוצר",
  });
  const top = computeRecipeHealthState({ base: baseHealth, pack: packHealth });

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

  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-3 text-lg font-bold">מתכון ייצור · {itemName}</h2>
      <div data-tracks-grid className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <RecipeTrackSummary
            trackLabel="בסיס המוצר"
            activeVersionLabel={baseTrack.activeVersionLabel}
            health={baseHealth}
          />
          {isAdmin && baseBomHeadId && (
            <button
              type="button"
              onClick={() =>
                handleEdit(
                  baseBomHeadId,
                  baseTrack.activeVersionId,
                  baseTrack.draftVersionId,
                )
              }
              className="mt-2 inline-block text-sm text-blue-700 underline"
            >
              Edit recipe →
            </button>
          )}
        </div>
        <div>
          <RecipeTrackSummary
            trackLabel="אריזת המוצר"
            activeVersionLabel={packTrack.activeVersionLabel}
            health={packHealth}
          />
          {isAdmin && packBomHeadId && (
            <button
              type="button"
              onClick={() =>
                handleEdit(
                  packBomHeadId,
                  packTrack.activeVersionId,
                  packTrack.draftVersionId,
                )
              }
              className="mt-2 inline-block text-sm text-blue-700 underline"
            >
              Edit recipe →
            </button>
          )}
        </div>
      </div>
      <div
        className={`mt-4 rounded p-3 font-semibold ${TOP_COLOR_CLASS[top.color]}`}
      >
        {top.color === "green" ? "🟢 " : top.color === "yellow" ? "🟡 " : "🔴 "}
        {top.label}
      </div>

      {confirmTrack && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="rounded-md bg-white p-4 shadow-lg max-w-md">
            <p className="mb-3">
              {confirmTrack.reason === "draft-exists"
                ? "יש כבר טיוטה. להמשיך לערוך אותה?"
                : "אין מתכון פעיל. ליצור מתכון ראשון?"}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border px-3 py-1"
                onClick={() => setConfirmTrack(null)}
              >
                ביטול
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-3 py-1 text-white"
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
                {confirmTrack.reason === "draft-exists" ? "להמשיך" : "ליצור"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
