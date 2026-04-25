// BomDraftEditorPage — page-level component for the DRAFT line editor at
// /admin/masters/boms/[bom_head_id]/[version_id]/edit. Composes:
//   - useQuery for the version row (filtered list + find by id)
//   - useQuery for the head row
//   - useQuery for the version's lines (the table body)
//   - useQuery for the active version's lines (for the Changes-from diff)
//   - useComponentReadinessMap for per-line pips
// Edit affordances are gated on version.status === "DRAFT".

"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BomLineRow as BomLineDataRow } from "@/components/admin/recipe-health/useTrackData";
import { useComponentReadinessMap } from "@/components/admin/recipe-health/useComponentReadinessMap";
import { ReadinessPanel } from "@/components/admin/recipe-health/ReadinessPanel";
import { BomLineRow } from "./BomLineRow";
import { BomLineAddDrawer } from "./BomLineAddDrawer";
import { BomLineDiff } from "./BomLineDiff";

interface BomDraftEditorPageProps {
  bomHeadId: string;
  versionId: string;
}

interface VersionRow {
  bom_version_id: string;
  bom_head_id: string;
  version_label: string;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED";
  updated_at: string;
}

interface HeadRow {
  bom_head_id: string;
  bom_kind: string;
  // item_name may not be on the upstream head response — guarded as optional.
  item_name?: string | null;
  item_id?: string | null;
}

export function BomDraftEditorPage({
  bomHeadId,
  versionId,
}: BomDraftEditorPageProps): JSX.Element {
  const versionListQuery = useQuery({
    queryKey: ["boms", "versions", bomHeadId],
    queryFn: async (): Promise<VersionRow[]> => {
      const res = await fetch(
        `/api/boms/versions?bom_head_id=${encodeURIComponent(bomHeadId)}`,
      );
      if (!res.ok) throw new Error(`versions: ${res.status}`);
      const body = await res.json();
      return (body.rows ?? []) as VersionRow[];
    },
  });
  const versions = versionListQuery.data ?? [];
  const version = versions.find((v) => v.bom_version_id === versionId) ?? null;
  const activeVersion = versions.find((v) => v.status === "ACTIVE") ?? null;

  const headQuery = useQuery({
    queryKey: ["boms", "head", bomHeadId],
    queryFn: async (): Promise<HeadRow | null> => {
      const res = await fetch(
        `/api/boms/heads?bom_head_id=${encodeURIComponent(bomHeadId)}`,
      );
      if (!res.ok) throw new Error(`head: ${res.status}`);
      const body = await res.json();
      const rows = (body.rows ?? []) as HeadRow[];
      return rows.find((h) => h.bom_head_id === bomHeadId) ?? rows[0] ?? null;
    },
  });

  const linesQuery = useQuery({
    queryKey: ["boms", "lines", versionId],
    queryFn: async (): Promise<BomLineDataRow[]> => {
      const res = await fetch(
        `/api/boms/lines?bom_version_id=${encodeURIComponent(versionId)}`,
      );
      if (!res.ok) throw new Error(`lines: ${res.status}`);
      const body = await res.json();
      return (body.rows ?? []) as BomLineDataRow[];
    },
  });

  const activeLinesQuery = useQuery({
    queryKey: ["boms", "lines", activeVersion?.bom_version_id ?? null],
    queryFn: async (): Promise<BomLineDataRow[]> => {
      const res = await fetch(
        `/api/boms/lines?bom_version_id=${encodeURIComponent(activeVersion!.bom_version_id)}`,
      );
      if (!res.ok) throw new Error(`active lines: ${res.status}`);
      const body = await res.json();
      return (body.rows ?? []) as BomLineDataRow[];
    },
    enabled: activeVersion !== null && activeVersion.bom_version_id !== versionId,
  });

  const lines = linesQuery.data;
  const componentIds = useMemo(
    () => Array.from(new Set((lines ?? []).map((l) => l.component_id))),
    [lines],
  );
  const readiness = useComponentReadinessMap(componentIds);

  const [addOpen, setAddOpen] = useState(false);
  const [fixComponentId, setFixComponentId] = useState<string | null>(null);

  if (!version || !headQuery.data || !lines) {
    return <div className="p-4">טוען…</div>;
  }

  const head = headQuery.data;
  const trackLabelEn = head.bom_kind === "BASE" ? "base formula" : "pack BOM";
  const editable = version.status === "DRAFT";
  const itemName = head.item_name ?? head.item_id ?? bomHeadId;

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-white p-3">
        <h1 className="text-lg font-semibold">
          Editing {version.version_label} DRAFT for {itemName} — {trackLabelEn}
        </h1>
        <span className="rounded bg-yellow-200 px-2 py-0.5 text-xs">
          {version.status}
        </span>
        <div className="ml-auto flex gap-2">
          <button type="button" className="rounded border px-3 py-1">
            Cancel
          </button>
          <button type="button" className="rounded border px-3 py-1">
            Save
          </button>
          <button
            type="button"
            className="rounded border bg-blue-600 px-3 py-1 text-white"
          >
            Publish →
          </button>
        </div>
      </header>
      {!editable && (
        <div className="bg-red-100 p-2 text-red-900">
          לא ניתן לערוך גרסה במצב {version.status}
        </div>
      )}
      <main className="p-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <div>
            {activeVersion && activeVersion.bom_version_id !== versionId && (
              <BomLineDiff
                draftLines={lines}
                activeLines={activeLinesQuery.data ?? []}
                activeVersionLabel={activeVersion.version_label}
              />
            )}
            {editable && (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="mb-2 rounded border px-3 py-1"
              >
                + Add component
              </button>
            )}
            {lines.length === 0 ? (
              <div className="rounded border border-dashed p-6 text-center text-gray-500">
                אין שורות. הוסף רכיב ראשון.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="px-2 py-1">Component</th>
                    <th className="px-2 py-1">Qty</th>
                    <th className="px-2 py-1">UOM</th>
                    <th className="px-2 py-1">Readiness</th>
                    <th className="px-2 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <BomLineRow
                      key={line.bom_line_id}
                      line={line}
                      versionId={versionId}
                      readiness={readiness.map.get(line.component_id) ?? null}
                      editable={editable}
                      onOpenQuickFix={(cid) => setFixComponentId(cid)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="hidden lg:block">
            <ReadinessPanel
              readinessMap={readiness.map}
              nowMs={Date.now()}
              onFix={setFixComponentId}
            />
          </div>
        </div>
        {/* Mobile-only bottom drawer with the same readiness data. */}
        <div className="lg:hidden">
          <ReadinessPanel
            readinessMap={readiness.map}
            nowMs={Date.now()}
            onFix={setFixComponentId}
            mobileMode
          />
        </div>
        <BomLineAddDrawer
          versionId={versionId}
          open={addOpen}
          onClose={() => setAddOpen(false)}
        />
        {fixComponentId && (
          <div
            role="dialog"
            data-testid={`quick-fix-stub-${fixComponentId}`}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          >
            <div className="rounded-md bg-white p-4 shadow-lg">
              <p>{fixComponentId}</p>
              <button
                type="button"
                onClick={() => setFixComponentId(null)}
                className="mt-2 rounded border px-3 py-1"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
