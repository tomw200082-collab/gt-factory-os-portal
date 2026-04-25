// Recipe-Health card — top of /admin/masters/items/[item_id] for
// MANUFACTURED items. Composes the pure readiness layer with two TanStack
// Query data hooks. Read-only display; the Edit-recipe links navigate to
// the line editor route added in Chunk 3.

"use client";

import Link from "next/link";
import { useMemo } from "react";
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

interface RecipeHealthCardProps {
  itemName: string;
  baseBomHeadId: string | null;
  packBomHeadId: string | null;
  isAdmin: boolean;
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
    const comp = readinessMap.get(line.component_id);
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
      qty: line.qty,
      component: comp,
      nowMs,
    });
  });
}

export function RecipeHealthCard({
  itemName,
  baseBomHeadId,
  packBomHeadId,
  isAdmin,
}: RecipeHealthCardProps): JSX.Element {
  const baseTrack = useTrackData(baseBomHeadId);
  const packTrack = useTrackData(packBomHeadId);

  const componentIds = useMemo(() => {
    const ids = new Set<string>();
    baseTrack.lines.forEach((l) => ids.add(l.component_id));
    packTrack.lines.forEach((l) => ids.add(l.component_id));
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
          {isAdmin && baseBomHeadId && baseTrack.activeVersionId && (
            <Link
              href={`/admin/masters/boms/${baseBomHeadId}/${baseTrack.activeVersionId}/edit`}
              className="mt-2 inline-block text-sm text-blue-700 underline"
            >
              Edit recipe →
            </Link>
          )}
        </div>
        <div>
          <RecipeTrackSummary
            trackLabel="אריזת המוצר"
            activeVersionLabel={packTrack.activeVersionLabel}
            health={packHealth}
          />
          {isAdmin && packBomHeadId && packTrack.activeVersionId && (
            <Link
              href={`/admin/masters/boms/${packBomHeadId}/${packTrack.activeVersionId}/edit`}
              className="mt-2 inline-block text-sm text-blue-700 underline"
            >
              Edit recipe →
            </Link>
          )}
        </div>
      </div>
      <div
        className={`mt-4 rounded p-3 font-semibold ${TOP_COLOR_CLASS[top.color]}`}
      >
        {top.color === "green" ? "🟢 " : top.color === "yellow" ? "🟡 " : "🔴 "}
        {top.label}
      </div>
    </section>
  );
}
